function decodeXml(value) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function xmlText(xml, tag) {
  const match = xml.match(
    new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">"),
  );
  return match ? decodeXml(match[1].trim()) : "";
}

function xmlLanguageText(xml, tag) {
  const container = xmlText(xml, tag);
  if (!container) return "";

  const match = container.match(
    /<language(?:\s[^>]*)?><!\[CDATA\[([\s\S]*?)\]\]><\/language>/,
  );
  if (match) return decodeXml(match[1].trim());

  return decodeXml(container);
}

function parseIdList(xml, tagName) {
  const ids = [];
  const re = new RegExp("<" + tagName + '[^>]*\\bid="(\\d+)"', "g");
  let match;

  while ((match = re.exec(xml))) {
    ids.push(Number(match[1]));
  }

  return ids;
}

function parseXmlBlocks(xml, tagName) {
  const blocks = [];
  const re = new RegExp(
    "<" + tagName + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tagName + ">",
    "g",
  );
  let match;

  while ((match = re.exec(xml))) {
    blocks.push(match[1]);
  }

  return blocks;
}

module.exports = {
  decodeXml,
  parseIdList,
  parseXmlBlocks,
  xmlLanguageText,
  xmlText,
};
