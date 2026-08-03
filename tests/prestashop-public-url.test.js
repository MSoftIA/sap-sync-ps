const assert = require("node:assert/strict");
const test = require("node:test");

const { buildPrestaPublicProductUrl } = require("../src/prestashop");

function withEnv(values, fn) {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }

  try {
    fn();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("construye link publico amigable desde dominio y link_rewrite", () => {
  withEnv(
    {
      PRESTASHOP_ENDPOINT: "https://carballo.com.do/",
      PRESTASHOP_PUBLIC_PRODUCT_URL_TEMPLATE: undefined,
    },
    () => {
      assert.equal(
        buildPrestaPublicProductUrl({ id: 123, linkRewrite: "producto-demo" }),
        "https://carballo.com.do/123-producto-demo.html",
      );
    },
  );
});

test("usa fallback publico sin slug cuando no hay link_rewrite", () => {
  withEnv(
    {
      PRESTASHOP_ENDPOINT: "https://carballo.com.do",
      PRESTASHOP_PUBLIC_PRODUCT_URL_TEMPLATE: undefined,
    },
    () => {
      assert.equal(
        buildPrestaPublicProductUrl({ id: 123, linkRewrite: "" }),
        "https://carballo.com.do/index.php?id_product=123&controller=product",
      );
    },
  );
});

test("permite plantilla publica custom con id y slug", () => {
  withEnv(
    {
      PRESTASHOP_ENDPOINT: "https://carballo.com.do",
      PRESTASHOP_PUBLIC_PRODUCT_URL_TEMPLATE: "/producto/{id}-{slug}",
    },
    () => {
      assert.equal(
        buildPrestaPublicProductUrl({ id: 123, linkRewrite: "producto-demo" }),
        "https://carballo.com.do/producto/123-producto-demo",
      );
    },
  );
});
