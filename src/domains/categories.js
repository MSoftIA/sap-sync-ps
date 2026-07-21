const { env, numberEnv } = require("../env");
const {
  buildPrestaCatalogSnapshot,
  createPrestaClient,
  hasPrestaConfig,
  listPrestaCategories,
} = require("../prestashop");
const { writeDomainSnapshot } = require("../report");
const { readSapCategoryDiagnostics } = require("../sap");
const { isWriteEnabled } = require("../sync-executor");
const { parseAnyIdList, parseXmlBlocks, xmlText } = require("../xml");

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return (
    normalizeName(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "categoria-" + Date.now()
  );
}

function cdata(value) {
  return "<![CDATA[" + String(value ?? "") + "]]>";
}

function setTagValue(xml, tagName, value) {
  const pattern = new RegExp(
    `(<${tagName}(?:\\s[^>]*)?>)([\\s\\S]*?)(</${tagName}>)`,
  );
  return xml.replace(pattern, `$1${cdata(value)}$3`);
}

function removeTag(xml, tagName) {
  const pattern = new RegExp(
    `\\s*<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?</${tagName}>`,
    "g",
  );
  return xml.replace(pattern, "");
}

function buildCategorySnapshot(categories) {
  const byParentAndName = new Map();

  for (const category of categories) {
    const key = `${Number(category.parentId || 0)}::${normalizeName(category.name)}`;
    if (!byParentAndName.has(key)) {
      byParentAndName.set(key, category);
    }
  }

  return {
    categories,
    byParentAndName,
  };
}

function getCategoryDefaults() {
  return {
    parentCategoryId: numberEnv("PRESTASHOP_CATEGORY_PARENT_ID", 2),
    languageId: numberEnv("PRESTASHOP_LANGUAGE_ID", 1),
    defaultCategoryId: numberEnv("PRESTASHOP_DEFAULT_CATEGORY_ID", 0) || null,
  };
}

function buildCreateCategoryXml(payload) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">',
    "  <category>",
    `    <id_parent>${cdata(payload.parentCategoryId)}</id_parent>`,
    "    <active><![CDATA[1]]></active>",
    "    <is_root_category><![CDATA[0]]></is_root_category>",
    "    <id_shop_default><![CDATA[1]]></id_shop_default>",
    "    <name>",
    `      <language id="${payload.languageId}">${cdata(payload.name)}</language>`,
    "    </name>",
    "    <link_rewrite>",
    `      <language id="${payload.languageId}">${cdata(slugify(payload.name))}</language>`,
    "    </link_rewrite>",
    "    <description>",
    `      <language id="${payload.languageId}">${cdata(payload.name)}</language>`,
    "    </description>",
    "  </category>",
    "</prestashop>",
  ].join("\n");
}

function parseCategoryIdsFromProductXml(productXml) {
  return parseXmlBlocks(productXml, "category")
    .map((block) => Number(xmlText(block, "id") || 0))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function upsertCategoryAssociations(productXml, categoryIds) {
  const uniqueCategoryIds = [...new Set(categoryIds.filter(Boolean))];
  const categoriesXml = [
    '      <categories nodeType="category" api="categories">',
    ...uniqueCategoryIds.map(
      (id) => `        <category><id>${cdata(id)}</id></category>`,
    ),
    "      </categories>",
  ].join("\n");

  if (/<categories\b[\s\S]*?<\/categories>/.test(productXml)) {
    return productXml.replace(
      /<categories\b[\s\S]*?<\/categories>/,
      categoriesXml,
    );
  }

  if (/<associations\b[\s\S]*?<\/associations>/.test(productXml)) {
    return productXml.replace(
      /<\/associations>/,
      `${categoriesXml}\n    </associations>`,
    );
  }

  return productXml.replace(
    /<\/product>/,
    `  <associations>\n${categoriesXml}\n    </associations>\n  </product>`,
  );
}

async function ensureCategory(client, snapshot, row, defaults, log) {
  const key = `${defaults.parentCategoryId}::${normalizeName(
    row.proposedPrestaCategory,
  )}`;
  const existing = snapshot.byParentAndName.get(key);

  if (existing) {
    return {
      categoryId: existing.id,
      categoryName: existing.name,
      created: false,
    };
  }

  if (!isWriteEnabled()) {
    return {
      categoryId: null,
      categoryName: row.proposedPrestaCategory,
      created: false,
      plannedCreate: true,
    };
  }

  const createXml = buildCreateCategoryXml({
    parentCategoryId: defaults.parentCategoryId,
    languageId: defaults.languageId,
    name: row.proposedPrestaCategory,
  });
  const responseXml = await client.post("categories", createXml, {
    display: "[id]",
  });
  const ids = parseAnyIdList(responseXml, "category");
  const categoryId = ids[0] || null;

  if (!categoryId) {
    throw new Error(
      "No se pudo recuperar el id de la categoria creada: " +
        row.proposedPrestaCategory,
    );
  }

  const createdCategory = {
    id: categoryId,
    parentId: defaults.parentCategoryId,
    active: "1",
    name: row.proposedPrestaCategory,
  };
  snapshot.categories.push(createdCategory);
  snapshot.byParentAndName.set(key, createdCategory);

  log("info", "Categoria creada en PrestaShop", {
    categoryId,
    categoryName: row.proposedPrestaCategory,
    parentCategoryId: defaults.parentCategoryId,
  });

  return {
    categoryId,
    categoryName: row.proposedPrestaCategory,
    created: true,
  };
}

async function ensureCategoryPath(client, snapshot, path, defaults, log) {
  let currentParentId = defaults.parentCategoryId;
  let lastResult = null;

  for (const name of path) {
    const result = await ensureCategory(
      client,
      snapshot,
      { proposedPrestaCategory: name },
      { ...defaults, parentCategoryId: currentParentId },
      log,
    );
    lastResult = result;
    if (!result.categoryId) {
      break;
    }
    currentParentId = result.categoryId;
  }

  return lastResult;
}

async function assignProductToCategory(client, productId, categoryId) {
  const existingProductXml = await client.get("products/" + productId);
  const currentCategoryIds = parseCategoryIdsFromProductXml(existingProductXml);
  const nextCategoryIds = [...new Set([categoryId, ...currentCategoryIds])];

  let updatedXml = existingProductXml;
  updatedXml = removeTag(updatedXml, "manufacturer_name");
  updatedXml = removeTag(updatedXml, "quantity");
  updatedXml = setTagValue(updatedXml, "id_category_default", categoryId);
  updatedXml = upsertCategoryAssociations(updatedXml, nextCategoryIds);

  // display:[id] prevents PrestaShop from building the full product response,
  // which is where this installation tends to fail with WebserviceOutputBuilder.
  await client.put("products/" + productId, updatedXml, { display: "[id]" });
}

function toDiagnosticRow(row) {
  return {
    itemCode: row.itemCode,
    itemName: row.itemName,
    itemGroupCode: row.itemGroupCode,
    itemGroupName: row.itemGroupName,
    activePropertyCount: row.activePropertyCount,
    activePropertyCodes: row.activePropertyCodes,
    activePropertyNames: row.activePropertyNames,
    proposedPrestaCategory: row.proposedPrestaCategory,
    proposedPrestaCategoryPath: row.proposedPrestaCategoryPath,
    hasMainCategory: row.hasMainCategory,
  };
}

function createCategoryMetrics() {
  return {
    total: 0,
    missingMainCategory: 0,
    categoriesExisting: 0,
    categoriesCreated: 0,
    categoriesToCreate: 0,
    productsFound: 0,
    productsUpdated: 0,
    productsToRelink: 0,
    productMissingInPrestashop: 0,
    duplicates: 0,
    errors: 0,
  };
}

function buildCategorySummary(rows, metrics) {
  const uniqueCategories = new Set(
    rows
      .map((row) => String(row.proposedPrestaCategory || "").trim())
      .filter(Boolean),
  );

  return {
    total: rows.length,
    productsEvaluated: rows.length,
    uniqueMainCategories: uniqueCategories.size,
    categoriesInPrestashop:
      metrics.categoriesExisting + metrics.categoriesCreated,
    categoriesMissingInPrestashop: metrics.categoriesToCreate,
    rowsWithoutMainCategory: metrics.missingMainCategory,
    categoriesExisting: metrics.categoriesExisting,
    categoriesCreated: metrics.categoriesCreated,
    categoriesToCreate: metrics.categoriesToCreate,
    productsFound: metrics.productsFound,
    productsUpdated: metrics.productsUpdated,
    productsToRelink: metrics.productsToRelink,
    productMissingInPrestashop: metrics.productMissingInPrestashop,
    duplicates: metrics.duplicates,
    errors: metrics.errors,
    writeEnabled: isWriteEnabled(),
  };
}

async function runCategoryDomain(log) {
  const defaults = getCategoryDefaults();
  const { diagnostics } = readSapCategoryDiagnostics(log);
  const rows = diagnostics.map(toDiagnosticRow);
  const metrics = createCategoryMetrics();
  metrics.total = rows.length;

  log("info", "Dominio categories iniciado", {
    sourceOfTruth: "sap",
    mode: isWriteEnabled() ? "write" : "dry_run",
    parentCategoryId: defaults.parentCategoryId,
    languageId: defaults.languageId,
    total: rows.length,
  });

  if (!hasPrestaConfig()) {
    const summary = buildCategorySummary(rows, metrics);
    const report = writeDomainSnapshot(log, {
      domain: "categories",
      summary,
      rows: rows.map((row) => ({
        status: row.hasMainCategory
          ? "missing_prestashop_config"
          : "missing_main_category",
        ...row,
        categoryId: null,
        categoryCreated: false,
        productId: null,
        productUpdated: false,
        notes: "PrestaShop no configurado para ejecutar esta sync.",
      })),
      csvHeaders: [
        "status",
        "itemCode",
        "itemName",
        "itemGroupCode",
        "itemGroupName",
        "proposedPrestaCategory",
        "categoryId",
        "categoryCreated",
        "productId",
        "productUpdated",
        "notes",
      ],
    });

    return {
      key: "categories",
      reportRows: [],
      summary: {
        implemented: true,
        processed: rows.length,
        sourceOfTruth: "sap",
        writesReports: false,
        diagnosticOnly: true,
        reportPaths: report.paths,
        categorySummary: summary,
      },
    };
  }

  const client = createPrestaClient(log);
  const categorySnapshot = buildCategorySnapshot(
    await listPrestaCategories(client),
  );
  const productSnapshot = await buildPrestaCatalogSnapshot(client, log);
  const resultRows = [];
  const seenCategoryKeys = new Set();
  let completed = 0;

  for (const row of rows) {
    let resultRow;

    try {
      let categoryResult;

      if (!row.hasMainCategory) {
        if (!defaults.defaultCategoryId) {
          metrics.missingMainCategory += 1;
          resultRow = {
            status: "missing_main_category",
            ...row,
            categoryId: null,
            categoryCreated: false,
            productId: null,
            productUpdated: false,
            notes:
              "Articulo sin U_Categoria en SAP y sin PRESTASHOP_DEFAULT_CATEGORY_ID configurado.",
          };
          completed += 1;
          if (
            rows.length <= 100 ||
            completed === rows.length ||
            completed % 25 === 0
          ) {
            log("info", "Progreso de dominio", {
              domain: "categories",
              current: completed,
              total: rows.length,
              percent:
                rows.length > 0
                  ? Math.round((completed / rows.length) * 100)
                  : 0,
              itemCode: row.itemCode,
            });
          }
          resultRows.push(resultRow);
          continue;
        }

        categoryResult = {
          categoryId: defaults.defaultCategoryId,
          categoryName: "default",
          created: false,
          usedDefault: true,
        };
      } else {
        const categoryKey = row.proposedPrestaCategoryPath.join("||");
        const firstTimeSeeingCategory = !seenCategoryKeys.has(categoryKey);
        if (firstTimeSeeingCategory) {
          seenCategoryKeys.add(categoryKey);
        }

        categoryResult = await ensureCategoryPath(
          client,
          categorySnapshot,
          row.proposedPrestaCategoryPath,
          defaults,
          log,
        );

        if (firstTimeSeeingCategory) {
          if (categoryResult && categoryResult.created) {
            metrics.categoriesCreated += 1;
          } else if (categoryResult && categoryResult.plannedCreate) {
            metrics.categoriesToCreate += 1;
          } else {
            metrics.categoriesExisting += 1;
          }
        }
      }

      {
        const matches =
          productSnapshot.productsByReference.get(row.itemCode) || [];

        if (matches.length === 0) {
          metrics.productMissingInPrestashop += 1;
          resultRow = {
            status:
              categoryResult && categoryResult.plannedCreate
                ? "category_planned_product_missing"
                : "product_missing_in_prestashop",
            ...row,
            categoryId: categoryResult ? categoryResult.categoryId : null,
            categoryCreated: categoryResult ? categoryResult.created : false,
            productId: null,
            productUpdated: false,
            notes: "No existe producto correspondiente en PrestaShop.",
          };
        } else if (matches.length > 1) {
          metrics.duplicates += 1;
          resultRow = {
            status: "duplicate_product_reference",
            ...row,
            categoryId: categoryResult ? categoryResult.categoryId : null,
            categoryCreated: categoryResult ? categoryResult.created : false,
            productId: matches[0].id,
            productUpdated: false,
            notes:
              "Referencia duplicada en PrestaShop. Requiere revision manual.",
          };
        } else {
          metrics.productsFound += 1;
          const product = matches[0];
          const currentDefaultCategoryId = Number(
            product.defaultCategory || 0,
          );
          const targetCategoryId = Number(
            categoryResult ? categoryResult.categoryId : 0,
          );
          const needsUpdate =
            targetCategoryId > 0 &&
            currentDefaultCategoryId !== targetCategoryId;

          if (needsUpdate) {
            metrics.productsToRelink += 1;
          }

          if (needsUpdate && isWriteEnabled()) {
            await assignProductToCategory(
              client,
              product.id,
              targetCategoryId,
            );
            metrics.productsUpdated += 1;
          }

          resultRow = {
            status: needsUpdate
              ? isWriteEnabled()
                ? "product_category_updated"
                : "product_category_update_planned"
              : "product_category_ok",
            ...row,
            categoryId: categoryResult ? categoryResult.categoryId : null,
            categoryCreated: categoryResult ? categoryResult.created : false,
            productId: product.id,
            productUpdated: needsUpdate && isWriteEnabled(),
            notes: needsUpdate
              ? "La categoria principal del producto se alinea desde SAP."
              : "El producto ya estaba alineado con la categoria principal.",
          };
        }
      }
    } catch (error) {
      metrics.errors += 1;
      resultRow = {
        status: "error",
        ...row,
        categoryId: null,
        categoryCreated: false,
        productId: null,
        productUpdated: false,
        notes: error.message,
      };
      log("error", "Fallo sincronizando categoria", {
        itemCode: row.itemCode,
        category: row.proposedPrestaCategory,
        message: error.message,
      });
    }

    resultRows.push(resultRow);
    completed += 1;

    if (
      rows.length <= 100 ||
      completed === rows.length ||
      completed % 25 === 0
    ) {
      log("info", "Progreso de dominio", {
        domain: "categories",
        current: completed,
        total: rows.length,
        percent:
          rows.length > 0 ? Math.round((completed / rows.length) * 100) : 0,
        itemCode: row.itemCode,
      });
    }
  }


  const summary = buildCategorySummary(rows, metrics);
  const report = writeDomainSnapshot(log, {
    domain: "categories",
    summary,
    rows: resultRows,
    csvHeaders: [
      "status",
      "itemCode",
      "itemName",
      "itemGroupCode",
      "itemGroupName",
      "proposedPrestaCategory",
      "categoryId",
      "categoryCreated",
      "productId",
      "productUpdated",
      "notes",
    ],
  });

  log("info", "Dominio categories finalizado", {
    processed: resultRows.length,
    ...summary,
  });

  return {
    key: "categories",
    reportRows: [],
    summary: {
      implemented: true,
      processed: resultRows.length,
      sourceOfTruth: "sap",
      writesReports: false,
      reportPaths: report.paths,
      categorySummary: summary,
    },
  };
}

module.exports = {
  runCategoryDomain,
};
