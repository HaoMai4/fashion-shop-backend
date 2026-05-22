const Product = require("../models/Product");
const Category = require("../models/Category");
const ProductVariant = require("../models/ProductVariant");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";


const CHAT_DEBUG = process.env.CHAT_DEBUG === "1";

let genAI = null;
if (API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(API_KEY);
  } catch (e) {
    console.warn("Init Gemini failed:", e.message);
  }
}

const META_TTL = 60_000;
let _metaCache = { ts: 0, categories: [], brands: [] };
let _variantColorCache = { ts: 0, colors: [] };

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripDiacritics(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function normalizeText(str) {
  return stripDiacritics(str).toLowerCase();
}

function normalizePhrase(str) {
  return normalizeText(str)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPhrase(text, phrase) {
  const textNorm = ` ${normalizePhrase(text)} `;
  const phraseNorm = ` ${normalizePhrase(phrase)} `;

  return textNorm.includes(phraseNorm);
}

function isPriceLikeToken(token) {
  const norm = normalizeText(token || "");
  return /^\d+(k|ngan|nghin|tr|trieu|triệu)?$/i.test(norm);
}

const GENERIC_WORDS = new Set([
  "áo", "ao", "quần", "quan", "đồ", "do", "basic",
  "giày", "giay", "sandal", "phụ", "kien", "thời", "trang", "thoi",
  "trending", "local", "brand"
]);

const STOPWORDS = new Set([
  "tìm", "tim", "sản", "san", "phẩm", "pham", "cần", "can", "mua", "giúp", "giup",
  "cho", "có", "co", "màu", "mau", "tôi", "toi", "mình", "minh", "xin", "vui", "lòng",
  "long", "loại", "loai", "muốn", "giá", "gia", "cái", "chiếc", "hãng", "hang", "mẫu",
  "dưới", "duoi", "trên", "tren", "từ", "tu", "khoảng", "khoang",
  "rẻ", "re", "hơn", "hon", "ngân", "sách", "sach",
  "của", "cua", "với", "voi", "để", "de", "và", "va", "là", "la",
  "không", "khong", "đang", "dang", "nào", "nao",
  "món", "mon", "phù", "phu", "hợp", "hop", "phù hợp", "phu hop",
  "vậy", "vay"
]);

const SALE_TERMS = new Set([
  "sale",
  "giam",
  "giảm",
  "giam gia",
  "giảm giá",
  "khuyen mai",
  "khuyến mãi",
  "khuyenmai",
  "discount",
  "off",
  "uu dai",
  "ưu đãi",
  "uudai",
]);

const META_INTENTS = new Set([
  "capability_question",
  "ai_working_explanation",
  "privacy_memory_question",
  "model_question",
  "order_creation_question",
]);

const STORE_CATALOG_GUIDE = `
Phạm vi sản phẩm hiện tại của MATEWEAR:
- Ưu tiên tư vấn quanh các nhóm thời trang đang có khả năng bán trên website: áo thun, áo polo, áo sơ mi, áo khoác, quần short, quần dài, váy/chân váy nếu dữ liệu có sản phẩm nữ.
- Với phụ kiện như mũ, kính, sandal, dép, đồ bơi: chỉ nhắc như món người dùng có thể tự chuẩn bị thêm nếu phù hợp hoàn cảnh, không nói rằng website đang bán nếu không có trong danh sách sản phẩm thật.
- Không khẳng định MATEWEAR có bán một loại sản phẩm nếu backend không truyền sản phẩm đó trong "Sản phẩm thật từ database".
`;

const GREETING_TERMS = [
  "xin chao",
  "chao",
  "hello",
  "hi",
  "hey",
  "alo",
];

const OUTFIT_ADVICE_TERMS = [
  "outfit",
  "phoi do",
  "phối đồ",
  "mac gi",
  "mặc gì",
  "nen mac",
  "nên mặc",
  "tu van do",
  "tư vấn đồ",
  "tu van outfit",
  "tư vấn outfit",
  "di hoc",
  "đi học",
  "di choi",
  "đi chơi",
  "di lam",
  "đi làm",
  "du tiec",
  "dự tiệc",
  "sinh nhat",
  "sinh nhật",
  "hen ho",
  "hẹn hò",
  "cuoi tuan",
  "cuối tuần",
  "qua tang",
  "quà tặng",
  "ban trai",
  "bạn trai",
  "ban gai",
  "bạn gái",
  "lich su",
  "lịch sự",
  "tre trung",
  "trẻ trung",
  "tuong tu",
  "tương tự",
  "san pham tuong tu",
  "sản phẩm tương tự",
  "giong voi",
  "giống với",
  "phoi cung",
  "phối cùng",
  "de phoi",
  "dễ phối",
  "de phoi cung",
  "dễ phối cùng",
  "di bien",
  "đi biển",
  "du lich",
  "du lịch",
  "nghi duong",
  "nghỉ dưỡng",
  "phong cach",
  "phong cách",
  "nang dong",
  "năng động",
  "ca tinh",
  "cá tính",
  "toi gian",
  "tối giản",
  "chon giup",
  "chọn giúp",
  "chon cho minh",
  "chọn cho mình",
  "vai mon",
  "vài món",
  "set do",
  "set đồ",
  "goi y set",
  "gợi ý set",
  "tang qua",
  "tặng quà",
  "tang vo",
  "tặng vợ",
  "qua cho vo",
  "quà cho vợ",
  "vo",
  "vợ",
];

const CATEGORY_ALIASES = [
  {
    slugCandidates: ["ao-polo-nam", "ao-polo", "polo"],
    aliases: ["ao polo", "polo", "thun polo"],
  },
  {
    slugCandidates: ["ao-so-mi-nam", "ao-so-mi", "so-mi"],
    aliases: ["ao so mi", "so mi", "somi", "shirt"],
  },
  {
    slugCandidates: ["ao-thun-nam", "ao-thun", "thun"],
    aliases: ["ao thun", "thun", "t shirt", "tshirt"],
  },
  {
    slugCandidates: ["quan-short", "quan-short-nam", "short"],
    aliases: ["quan short", "short", "quan dui", "quan đui"],
  },
  {
    slugCandidates: [
      "quan-jeans-nam",
      "quan-jean-nam",
      "quan-jeans",
      "quan-jean",
      "jeans",
      "jean",
    ],
    aliases: [
      "quan jeans",
      "quần jeans",
      "quan jean",
      "quần jean",
      "jeans",
      "jean",
      "denim",
    ],
  },
  {
    slugCandidates: [
      "quan-dai",
      "quan-dai-nam",
      "quan-tay",
      "quan-nam",
      "quan",
    ],
    aliases: [
      "quan",
      "quần",
      "quan nam",
      "quần nam",
      "quan dai",
      "quần dài",
      "quan tay",
      "quần tây",
      "quan kaki",
      "quần kaki",
      "kaki",
    ],
  },
  {
    slugCandidates: ["do-the-thao", "the-thao"],
    aliases: ["do the thao", "the thao", "sport", "gym", "chay bo"],
  },
  {
    slugCandidates: ["phu-kien", "phu-kien-nam"],
    aliases: ["phu kien", "that lung", "tat", "mu", "non"],
  },
];

const BODY_TERMS = new Set([
  "size", "cao", "nang", "nặng", "kg", "cm", "mac", "mặc",
  "vua", "vừa", "fit", "body", "dang", "dáng"
]);

const COLOR_ALIASES = {
  black: ["đen", "black", "đen tuyền"],
  white: ["trắng", "white"],
  red: ["đỏ", "red"],
  blue: ["xanh dương", "xanh lam", "blue"],
  green: ["xanh lá", "green"],
  yellow: ["vàng", "yellow", "gold"],
  brown: ["nâu", "brown"],
  gray: ["xám", "gray", "grey", "ghi", "silver"],
  purple: ["tím", "purple", "violet"],
  pink: ["hồng", "pink"],
  orange: ["cam", "orange"],
  navy: ["xanh dương", "navy"]
};

Object.keys(COLOR_ALIASES).forEach((base) => {
  const arr = COLOR_ALIASES[base];
  const extra = new Set(arr.map((a) => stripDiacritics(a)));
  extra.forEach((e) => {
    if (!arr.includes(e)) arr.push(e);
  });
  const baseNo = stripDiacritics(base);
  if (!arr.includes(baseNo)) arr.push(baseNo);
});

async function loadMeta() {
  const now = Date.now();
  if (now - _metaCache.ts < META_TTL) return _metaCache;

  const categories = await Category.find({}, "slug name").lean();
  const brands = (await Product.distinct("brand")).filter(Boolean);

  _metaCache = { ts: now, categories, brands };
  return _metaCache;
}

async function loadVariantColors() {
  const now = Date.now();
  if (
    now - _variantColorCache.ts < 5 * 60_000 &&
    _variantColorCache.colors.length
  ) {
    return _variantColorCache.colors;
  }

  const list = await ProductVariant.distinct("color");
  _variantColorCache = {
    ts: now,
    colors: (list || []).filter(Boolean).map((c) => c.toLowerCase()),
  };

  return _variantColorCache.colors;
}

function hasColorAlias(sentenceLower, alias) {
  const aliasLower = String(alias || "").trim().toLowerCase();
  const aliasNorm = normalizeText(aliasLower);
  const sentenceNorm = normalizeText(sentenceLower);

  if (!aliasNorm) return false;

  const rawTokens = sentenceLower
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  const normTokens = sentenceNorm
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  // Với alias màu ngắn như "đỏ", "tím", "tim", "red":
  // chỉ match theo raw token người dùng gõ thật.
  // Không match theo normalized token để tránh "tìm" => "tim" => màu tím.
  if (aliasNorm.length <= 3) {
    return rawTokens.includes(aliasLower);
  }

  if (aliasNorm.includes(" ")) {
    const escaped = escapeRegex(aliasNorm);
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return regex.test(sentenceNorm);
  }

  return normTokens.includes(aliasNorm);
}

function normalizeColor(sentenceLower) {
  for (const base in COLOR_ALIASES) {
    const aliases = COLOR_ALIASES[base];

    if (aliases.some((alias) => hasColorAlias(sentenceLower, alias))) {
      return base;
    }
  }

  return null;
}

async function dynamicColorDetect(messageLower) {
  const colors = await loadVariantColors();

  const afterColor = messageLower.split(/\bmàu\b/i)[1];
  if (afterColor) {
    const token = afterColor.trim().split(/\s+/)[0]?.toLowerCase();
    if (token && colors.some((color) => normalizeText(color) === normalizeText(token))) {
      return token;
    }
  }

  for (const color of colors) {
    if (hasColorAlias(messageLower, color)) {
      return color;
    }
  }

  return null;
}

function normalizeSizeToken(tok) {
  if (!tok) return tok;
  const t = tok.toString().trim().toUpperCase();
  if (t === "XXL") return "2XL";
  if (t === "XLL") return "XL";
  return t;
}

function extractSizes(textLower) {
  if (!hasExplicitSizeCue(textLower)) return null;

  const text = normalizeText(textLower || "");
  const raw = String(textLower || "").toLowerCase();
  const sizePattern = "(3xl|2xl|xxl|xl|xs|s|m|l)";

  const matches = [];

  const normalizedRegex = new RegExp(
    `\\b(?:size|sz|mac size|mac)\\s*${sizePattern}\\b`,
    "gi"
  );

  for (const match of text.matchAll(normalizedRegex)) {
    const size = match[1];
    if (size) matches.push(size);
  }

  const rawRegex = new RegExp(`\\bcỡ\\s*${sizePattern}\\b`, "gi");

  for (const match of raw.matchAll(rawRegex)) {
    const size = match[1];
    if (size) matches.push(size);
  }

  if (!matches.length) return null;

  const normalized = [...new Set(matches.map((m) => normalizeSizeToken(m)))];
  return normalized.length === 1 ? normalized[0] : normalized;
}

function hasPriceCue(message) {
  const raw = String(message || "").toLowerCase();
  const text = normalizeText(message || "");

  const hasPriceUnit =
    /\d+(?:[.,]\d+)?\s*(k|ngàn|nghìn|tr|triệu|đ|₫|vnd)\b/i.test(raw);

  if (hasPriceUnit) return true;

  return [
    "gia",
    "duoi",
    "tren",
    "tu",
    "khoang",
    "tam gia",
    "ngan sach",
    "budget",
    "re hon",
    "dat hon",
  ].some((term) => hasPhrase(text, term));
}

function hasExplicitSizeCue(message) {
  const raw = String(message || "").toLowerCase();
  const text = normalizeText(message || "");

  const sizePattern = "(3xl|2xl|xxl|xl|xs|s|m|l)";

  return (
    new RegExp(`\\b(size|sz)\\s*${sizePattern}\\b`, "i").test(text) ||
    new RegExp(`\\bmac\\s+size\\s*${sizePattern}\\b`, "i").test(text) ||
    new RegExp(`\\bmac\\s+${sizePattern}\\b`, "i").test(text) ||
    new RegExp(`\\bcỡ\\s*${sizePattern}\\b`, "i").test(raw)
  );
}

function hasSpecificCategoryCue(message) {
  const raw = String(message || "").toLowerCase();
  const text = normalizePhrase(message || "");

  const phraseTerms = [
    "ao polo",
    "polo",
    "ao so mi",
    "so mi",
    "ao thun",
    "thun",
    "ao khoac",
    "quan",
    "chan vay",
    "do the thao",
    "short",
    "jean",
    "kaki",
    "san pham",
  ];

  if (phraseTerms.some((term) => hasPhrase(text, term))) {
    return true;
  }

  // Chặn lỗi "vậy" bị normalize thành "vay".
  // Chỉ nhận là váy nếu user thật sự gõ "váy" hoặc "vay" không dấu.
  const rawTokens = raw
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter(Boolean);

  if (rawTokens.includes("váy")) {
    return true;
  }

  const noToneVayLooksLikeDress =
    rawTokens.includes("vay") &&
    !(
      rawTokens.includes("co") &&
      rawTokens.includes("mon") &&
      rawTokens.includes("phu") &&
      rawTokens.includes("hop")
    );

  if (noToneVayLooksLikeDress) {
    return true;
  }

  return false;
}

function hasBudgetMaxCue(message) {
  const raw = String(message || "").toLowerCase();

  return (
    hasPhrase(raw, "toi co") ||
    hasPhrase(raw, "mình có") ||
    hasPhrase(raw, "minh co") ||
    hasPhrase(raw, "ngan sach") ||
    hasPhrase(raw, "ngân sách") ||
    hasPhrase(raw, "budget") ||
    hasPhrase(raw, "toi da") ||
    hasPhrase(raw, "tối đa") ||
    hasPhrase(raw, "khong qua") ||
    hasPhrase(raw, "không quá") ||
    hasPhrase(raw, "duoi") ||
    hasPhrase(raw, "dưới") ||
    hasPhrase(raw, "so tien") ||
    hasPhrase(raw, "số tiền")
  );
}

function extractPrices(textLower) {
  if (!hasPriceCue(textLower)) {
    return { minPrice: null, maxPrice: null };
  }

  const raw = String(textLower || "").toLowerCase();

  const unitFactor = (n, u) => {
    let num = Number(String(n).replace(/[.,]/g, ""));
    if (isNaN(num)) return null;

    if (!u) {
      if (num < 1000) return num * 1000;
      return num;
    }

    u = u.trim().toLowerCase();

    if (["k", "ngàn", "nghìn", "k."].includes(u)) return num * 1000;
    if (["tr", "triệu"].includes(u)) return num * 1_000_000;
    if (["trăm"].includes(u)) return num * 100;

    return num;
  };

  let minPrice = null;
  let maxPrice = null;

  const rangeR =
    /(\d+(?:[.,]\d+)?)(\s?(k|ngàn|nghìn|tr|triệu|trăm)?)\s*(?:-|đến|to|>|<|>=|<=|~)\s*(\d+(?:[.,]\d+)?)(\s?(k|ngàn|nghìn|tr|triệu|trăm)?)/i;

  const singleR =
    /(dưới|duoi|trên|tren|từ|tu|>=|<=|>|<|~)?\s*(\d+(?:[.,]\d+)?)(\s?(k|ngàn|nghìn|tr|triệu|trăm)?)/i;

  const rangeM = raw.match(rangeR);
  if (rangeM) {
    const v1 = unitFactor(rangeM[1], rangeM[3]);
    const v2 = unitFactor(rangeM[4], rangeM[6]);

    if (v1 && v2) {
      minPrice = Math.min(v1, v2);
      maxPrice = Math.max(v1, v2);
      return { minPrice, maxPrice };
    }
  }

  const sM = raw.match(singleR);
  if (sM) {
    const dir = normalizeText(sM[1] || "");
    const val = unitFactor(sM[2], sM[4]);
    const budgetMaxCue = hasBudgetMaxCue(raw);

    if (val) {
      if (["duoi", "<", "<="].includes(dir)) {
        maxPrice = val;
      } else if (["tren", "tu", ">", ">="].includes(dir)) {
        minPrice = val;
      } else if (budgetMaxCue) {
        maxPrice = val;
      } else if (dir === "~") {
        minPrice = Math.round(val * 0.8);
        maxPrice = Math.round(val * 1.2);
      } else {
        minPrice = Math.round(val);
        maxPrice = Math.round(val * 1.3);
      }
    }
  }

  return { minPrice, maxPrice };
}

function extractBodyInfo(message) {
  const text = normalizeText(message);

  let heightCm = null;
  let weightKg = null;
  let gender = null;

  const hMeter = text.match(/(\d)\s*m\s*(\d{1,2})\b/);
  if (hMeter) {
    heightCm = Number(hMeter[1]) * 100 + Number(hMeter[2]);
  }

  if (!heightCm) {
    const hCm = text.match(/\b(1[4-9]\d|2[0-1]\d)\s*cm\b/);
    if (hCm) {
      heightCm = Number(hCm[1]);
    }
  }

  const weight = text.match(/\b(\d{2,3})\s*kg\b/);
  if (weight) {
    weightKg = Number(weight[1]);
  }

  const relationshipGender = detectRelationshipGender(message);

  if (relationshipGender === "nu") {
    gender = "female";
  } else if (relationshipGender === "nam") {
    gender = "male";
  } else {
    const raw = String(message || "").toLowerCase();

    if (
      /\b(nữ|nu|female)\b/i.test(raw) ||
      raw.includes("con gái") ||
      raw.includes("con gai") ||
      raw.includes("phụ nữ") ||
      raw.includes("phu nu") ||
      raw.includes("bạn gái") ||
      raw.includes("ban gai")
    ) {
      gender = "female";
    } else if (
      /\b(nam|male)\b/i.test(raw) ||
      raw.includes("con trai") ||
      raw.includes("đàn ông") ||
      raw.includes("dan ong") ||
      raw.includes("bạn trai") ||
      raw.includes("ban trai")
    ) {
      gender = "male";
    }
  }

  return { heightCm, weightKg, gender };
}

function getAdjacentSize(size, direction) {
  const arr = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
  const idx = arr.indexOf(size);
  if (idx === -1) return size;
  const next = direction === "up" ? idx + 1 : idx - 1;
  if (next < 0 || next >= arr.length) return size;
  return arr[next];
}

function recommendSizeFromBody({ heightCm, weightKg, gender }) {
  if (!heightCm || !weightKg) return null;

  if (gender === "female") {
    if (weightKg <= 45) {
      if (heightCm <= 158) return "S";
      return "M";
    }

    if (weightKg <= 52) {
      return "M";
    }

    if (weightKg <= 60) {
      if (heightCm <= 165) return "M";
      return "L";
    }

    if (weightKg <= 68) return "XL";

    return "2XL";
  }

  if (heightCm <= 162 && weightKg <= 55) return "S";
  if (heightCm <= 170 && weightKg <= 68) return "M";
  if (heightCm <= 176 && weightKg <= 78) return "L";
  if (heightCm <= 182 && weightKg <= 88) return "XL";
  if (heightCm <= 188 && weightKg <= 98) return "2XL";

  return "3XL";
}

function buildSizeAdviceReply(body, size, totalProducts) {
  if (!body.heightCm || !body.weightKg) {
    return "Để mình tư vấn size chính xác hơn, bạn cho mình chiều cao và cân nặng nhé. Ví dụ: nam cao 1m72 nặng 68kg mặc size gì?";
  }

  const smaller = getAdjacentSize(size, "down");
  const larger = getAdjacentSize(size, "up");

  let tone = `Với chiều cao khoảng ${body.heightCm}cm và cân nặng ${body.weightKg}kg, mình gợi ý bạn thử size ${size}.`;
  tone += ` Nếu thích mặc ôm vừa người có thể cân nhắc ${smaller}, còn nếu thích mặc thoải mái hơn có thể thử ${larger}.`;

  if (totalProducts > 0) {
    tone += ` Mình cũng đã lọc ra ${totalProducts} sản phẩm có size ${size} cho bạn tham khảo.`;
  } else {
    tone += ` Hiện mình chưa lọc được nhiều sản phẩm đúng size này, nhưng bạn vẫn có thể ưu tiên thử size ${size} trước.`;
  }

  return tone;
}

function buildSaleReply(total, sampleProducts = [], filters = {}) {
  if (!total) {
    if (filters.maxPrice) {
      return `Hiện mình chưa thấy sản phẩm sale nào phù hợp trong ngân sách dưới ${formatVnd(filters.maxPrice)}. Bạn có thể tăng ngân sách một chút hoặc bỏ điều kiện sale để mình tìm thêm lựa chọn khác.`;
    }

    return "Hiện mình chưa thấy sản phẩm sale phù hợp. Bạn thử đổi danh mục, khoảng giá hoặc hỏi cụ thể hơn nhé.";
  }

  if (filters.maxPrice) {
    return `Mình tìm được ${total} sản phẩm đang sale trong ngân sách dưới ${formatVnd(filters.maxPrice)}. Bạn có thể xem các lựa chọn bên dưới, mỗi sản phẩm đều có lý do gợi ý để dễ cân nhắc hơn.`;
  }

  return `Mình tìm được ${total} sản phẩm đang sale. Bạn có thể xem các lựa chọn bên dưới, mỗi sản phẩm đều có lý do gợi ý để dễ cân nhắc hơn.`;
}

function isBestDiscountQuestion(message) {
  const text = normalizeText(message);

  return (
    text.includes("giam gia sau nhat") ||
    text.includes("giam sau nhat") ||
    text.includes("sale nhieu nhat") ||
    text.includes("giam nhieu nhat") ||
    text.includes("cao nhat") ||
    text.includes("bao nhieu %") ||
    text.includes("bao nhieu phan tram") ||
    text.includes("sau nhat la bao nhieu")
  );
}

function formatVnd(value) {
  return Number(value || 0).toLocaleString("vi-VN") + "đ";
}

function buildBestDiscountReply(products) {
  if (!Array.isArray(products) || !products.length) {
    return "Hiện mình chưa thấy sản phẩm sale phù hợp.";
  }

  const top = products[0];
  const percent = Number(top.discountPercent || 0);
  const oldPrice = Number(top.originalPrice || top.finalPrice || 0);
  const newPrice = Number(top.discountPrice || top.finalPrice || 0);

  if (percent <= 0) {
    return "Hiện tại mình chưa thấy sản phẩm nào có mức giảm giá nổi bật.";
  }

  return `Món đang giảm giá sâu nhất hiện tại là ${top.name}, từ ${formatVnd(oldPrice)} xuống còn ${formatVnd(newPrice)}, tương đương khoảng ${percent}%.`;
}

function buildProductRecommendationReason(product, styleContext = {}, filters = {}) {
  const price = Number(product.finalPrice || product.discountPrice || 0);
  const maxPrice = Number(filters.maxPrice || 0);
  const discountPercent = Number(product.discountPercent || 0);

  const keywords = Array.isArray(filters.keywords)
    ? filters.keywords.map((keyword) => normalizeText(keyword || ""))
    : [];

  const productName = normalizeText(product.name || "");
  const categoryName = normalizeText(
    product.category?.name || product.category?.slug || ""
  );

  const needsEasyMovement = keywords.some((keyword) =>
    keyword.includes("de van dong") ||
    keyword.includes("thoai mai") ||
    keyword.includes("khong qua om") ||
    keyword.includes("rong rai")
  );

  const contextReasons = [];

  if (styleContext.occasion === "đi làm" && styleContext.age) {
    contextReasons.push(`phù hợp nhu cầu đi làm ở độ tuổi khoảng ${styleContext.age}`);
  } else if (styleContext.occasion === "đi làm") {
    contextReasons.push("phù hợp nhu cầu đi làm");
  } else if (styleContext.age) {
    contextReasons.push(`phù hợp độ tuổi khoảng ${styleContext.age}`);
  }

  if (needsEasyMovement) {
    contextReasons.push("ưu tiên sự thoải mái, dễ vận động và không quá ôm");
  }

  const productReasons = [];

  if (discountPercent > 0) {
    productReasons.push(`đang có giá tốt, giảm khoảng ${discountPercent}%`);
  }

  if (
    productName.includes("so mi") ||
    categoryName.includes("so mi")
  ) {
    productReasons.push("kiểu sơ mi tạo cảm giác chỉn chu và hợp môi trường công sở");
  }

  if (
    productName.includes("polo") ||
    categoryName.includes("polo")
  ) {
    productReasons.push("áo polo có cổ nên vẫn gọn gàng nhưng thoải mái hơn sơ mi");
  }

  if (
    productName.includes("khoac") ||
    categoryName.includes("khoac")
  ) {
    productReasons.push("có thể dùng như lớp khoác nhẹ khi cần che nắng hoặc giữ ấm nhẹ");
  }

  if (product.material) {
    productReasons.push(`chất liệu ${product.material} dễ ứng dụng khi mặc hằng ngày`);
  }

  if (product.variant?.color) {
    productReasons.push(`màu ${product.variant.color} dễ phối`);
  }

  if (maxPrice && price && price <= maxPrice) {
    productReasons.push(`nằm trong ngân sách dưới ${formatVnd(maxPrice)}`);
  }

  if (product.outfitReason) {
    productReasons.push(product.outfitReason);
  }

  const uniqueContextReasons = [...new Set(contextReasons.filter(Boolean))];
  const uniqueProductReasons = [...new Set(productReasons.filter(Boolean))];

  const selectedReasons = [];

  if (uniqueContextReasons[0]) {
    selectedReasons.push(uniqueContextReasons[0]);
  }

  if (uniqueProductReasons[0]) {
    selectedReasons.push(uniqueProductReasons[0]);
  }

  if (
    selectedReasons.length < 2 &&
    uniqueContextReasons[1]
  ) {
    selectedReasons.push(uniqueContextReasons[1]);
  }

  if (!selectedReasons.length) {
    return "Dễ phối, form an toàn và phù hợp để tham khảo trong nhiều hoàn cảnh.";
  }

  return selectedReasons.slice(0, 2).join(", ") + ".";
}

function attachProductReasons(products = [], styleContext = {}, filters = {}) {
  return products.map((product) => ({
    ...product,
    reason:
      product.reason ||
      buildProductRecommendationReason(product, styleContext, filters),
  }));
}

function includesAnyNormalized(text, terms) {
  const normalized = normalizeText(text || "");
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function detectMetaIntent(message) {
  const text = normalizeText(message || "");

  if (
    includesAnyNormalized(text, [
      "ban lam duoc gi",
      "ban co the lam gi",
      "ban ho tro gi",
      "chuc nang cua ban",
      "ban giup duoc gi",
      "ai lam duoc gi",
    ])
  ) {
    return "capability_question";
  }

  if (
    includesAnyNormalized(text, [
      "ban hoat dong nhu the nao",
      "ban hieu cau hoi",
      "ban xu ly du lieu",
      "cach thuc ban lam viec",
      "ban lam viec voi du lieu",
      "khi minh hoi thi ban hieu",
    ])
  ) {
    return "ai_working_explanation";
  }

  if (
    includesAnyNormalized(text, [
      "co luu lich su",
      "luu lich su",
      "lich su tro chuyen",
      "bo nho",
      "luu thong tin",
      "luu lai thong tin",
      "du lieu ca nhan",
      "bao mat",
    ])
  ) {
    return "privacy_memory_question";
  }

  if (
    includesAnyNormalized(text, [
      "mo hinh ai",
      "model ai",
      "dung model gi",
      "su dung mo hinh",
      "gemini",
      "gpt",
      "llm",
    ])
  ) {
    return "model_question";
  }

  if (
    includesAnyNormalized(text, [
      "tao don",
      "dat hang giup",
      "dat don giup",
      "mua hang giup",
      "them vao gio",
      "checkout giup",
      "tao order",
    ])
  ) {
    return "order_creation_question";
  }

  return null;
}

function buildMetaIntentReply(intent) {
  if (intent === "capability_question") {
    return [
      "Mình là trợ lý tư vấn thời trang của MATEWEAR. Mình có thể hỗ trợ bạn:",
      "- Tìm sản phẩm theo loại, màu, size, giá, sale.",
      "- Tư vấn size dựa trên chiều cao và cân nặng.",
      "- Gợi ý phối đồ theo hoàn cảnh như đi học, đi làm, đi chơi, đi biển, thể thao hoặc dự tiệc.",
      "- Gợi ý sản phẩm đang có trên website để bạn xem chi tiết ở các thẻ sản phẩm bên dưới.",
      "- Giải đáp nhanh các thông tin mua sắm như thanh toán, vận chuyển, đổi trả.",
      "",
      "Bạn có thể hỏi kiểu: “Nam đi biển nên phối gì?”, “Áo polo dưới 400k có mẫu nào?”, hoặc “Mình cao 1m72 nặng 65kg mặc size gì?”.",
    ].join("\n");
  }

  if (intent === "ai_working_explanation") {
    return [
      "Khi bạn gửi câu hỏi, mình sẽ phân tích nội dung để xác định bạn đang cần gì: tìm sản phẩm, hỏi size, hỏi sale, phối đồ hay hỏi chính sách.",
      "Sau đó mình tách các thông tin quan trọng như loại sản phẩm, màu sắc, size, khoảng giá, hoàn cảnh sử dụng và giới tính nếu bạn có nói.",
      "Với câu hỏi liên quan sản phẩm, mình tìm trong dữ liệu sản phẩm của MATEWEAR rồi trả về gợi ý phù hợp. Với câu hỏi phối đồ, mình ưu tiên chọn các món có thể phối thành set để bạn xem chi tiết ở các thẻ sản phẩm bên dưới.",
    ].join("\n");
  }

  if (intent === "privacy_memory_question") {
    return [
      "Hiện tại mình dùng thông tin trong cuộc trò chuyện và dữ liệu mua sắm cần thiết để hỗ trợ tư vấn trong phạm vi website.",
      "Mình không tự ý tạo đơn hay thay đổi thông tin tài khoản của bạn. Các dữ liệu như sản phẩm đã xem, giỏ hàng, yêu thích hoặc đơn hàng chỉ được dùng để gợi ý mua sắm phù hợp hơn.",
      "Nếu bạn cần thông tin chính sách bảo mật chính thức, bạn nên xem mục chính sách trên website hoặc liên hệ bộ phận hỗ trợ của MATEWEAR.",
    ].join("\n");
  }

  if (intent === "model_question") {
    return [
      "Mình là trợ lý AI được tích hợp vào hệ thống MATEWEAR để hỗ trợ tư vấn thời trang và mua sắm.",
      "Ở backend, hệ thống có thể dùng mô hình AI bên ngoài để hỗ trợ hiểu câu hỏi, sau đó kết hợp với dữ liệu sản phẩm thật trong database để trả lời.",
      "Mình không công khai khóa API hay cấu hình nội bộ, nhưng có thể giải thích ở mức nghiệp vụ: phân tích câu hỏi, tìm sản phẩm phù hợp, rồi trả lời bằng ngôn ngữ dễ hiểu.",
    ].join("\n");
  }

  if (intent === "order_creation_question") {
    return [
      "Hiện tại mình chưa tạo đơn hàng trực tiếp thay bạn.",
      "Mình có thể gợi ý sản phẩm phù hợp để bạn mở trang chi tiết từ thẻ sản phẩm, chọn màu, size, số lượng rồi thêm vào giỏ hàng hoặc mua ngay trên website.",
      "Cách này giúp bạn kiểm tra lại thông tin sản phẩm và địa chỉ trước khi đặt đơn.",
    ].join("\n");
  }

  return null;
}

async function generateAssistantReply({
  userMessage,
  conversationText,
  intent,
  products = [],
  filters = {},
  metrics = {},
  styleContext = null,
  sizeSuggestion = null,
}) {
  if (!genAI) return null;

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const productContextLimit = intent === "outfit_advice" ? 4 : 8;

    const productContext = products.slice(0, productContextLimit).map((p, index) => ({
      index: index + 1,
      name: p.name,
      gender: p.gender || null,
      material: p.material || null,
      price: p.finalPrice,
      originalPrice: p.originalPrice,
      discountPrice: p.discountPrice,
      discountPercent: p.discountPercent,
      category: p.category?.name || p.category?.slug || null,
      brand: p.brand || null,
      colors: p.availableColors || [],
      sizes: p.availableSizes || [],
      tags: p.tags || [],
      shortDescription: p.shortDescription || "",
      reason: p.reason || p.outfitReason || "",
      outfitReason: p.outfitReason || "",
    }));

    const systemInstruction = `
Bạn là Stylist AI của MATEWEAR, một website thời trang.

${STORE_CATALOG_GUIDE}

Vai trò:
- Tư vấn thời trang, tìm sản phẩm, gợi ý size, phối đồ, giải thích thông tin mua sắm.
- Trả lời tự nhiên như stylist, thân thiện vừa đủ, không quá dài, không máy móc.
- Ưu tiên tư vấn có lý do: vì sao phối như vậy, hợp hoàn cảnh nào, nên chọn màu/chất liệu/form ra sao.
- Khi có dữ liệu gender, material, màu, size, category hoặc shortDescription, hãy dùng các thông tin đó để tư vấn cụ thể hơn.

Quy tắc bắt buộc:
- Chỉ nhắc tên sản phẩm nếu sản phẩm nằm trong danh sách "Sản phẩm thật từ database".
- Không bịa sản phẩm, giá, màu, size, tồn kho hoặc chính sách.
- Khi chỉ tư vấn phong cách chung và không có sản phẩm được backend truyền vào, hãy dùng các cụm như "bạn có thể chuẩn bị", "nên ưu tiên", "có thể phối", không nói "MATEWEAR có" hoặc "shop có".
- Không liệt kê quá nhiều món ngoài phạm vi catalog hiện tại. Ưu tiên tư vấn sát với nhóm áo, quần, váy/chân váy, áo khoác nhẹ.
- Không ghi link dạng /san-pham/slug trong nội dung trả lời, vì giao diện đã có thẻ sản phẩm bên dưới.
- Nếu có sản phẩm phù hợp và intent liên quan đến sản phẩm, có thể nói người dùng xem các sản phẩm bên dưới.
- Với câu hỏi meta như bạn làm được gì, hoạt động thế nào, mô hình AI, dữ liệu/bộ nhớ, không nhắc đến sản phẩm bên dưới nếu không có sản phẩm.
- Nếu không có sản phẩm phù hợp, vẫn tư vấn định hướng chung và hỏi thêm thông tin.
- Nếu người dùng hỏi tạo đơn, nói hiện chưa tạo đơn trực tiếp, chỉ hỗ trợ gợi ý sản phẩm để người dùng tự chọn.
- Nếu người dùng hỏi mô hình AI, trả lời ở mức nghiệp vụ, không nói khóa API hoặc cấu hình kỹ thuật nội bộ.
- Nếu người dùng hỏi dữ liệu/bộ nhớ, trả lời thận trọng: chỉ dùng dữ liệu cần thiết để hỗ trợ mua sắm trong phạm vi hệ thống.
- Hạn chế emoji, tối đa 1 emoji nếu thật sự cần.
- Không dùng giọng quảng cáo quá đà hoặc khẩu hiệu như "xả hơi", "tự tin khoe cá tính", "lên đồ cực cháy".
- Giọng văn nên giống stylist tư vấn thật: tự nhiên, rõ ý, có lý do chọn chất liệu, form, màu và hoàn cảnh sử dụng.
- Trả lời bằng tiếng Việt.
- Không liệt kê quá nhiều câu hỏi cùng lúc. Mỗi phản hồi chỉ hỏi thêm tối đa 2 thông tin quan trọng nhất.
- Chỉ nhắc chất liệu nếu trường material hoặc shortDescription của sản phẩm có thông tin đó. Không tự đoán chất liệu như cotton, linen, thun lạnh nếu dữ liệu không có.
- Nếu user nói "vài món", "chọn giúp", "phối set", hãy trả lời gọn, tối đa 3 đến 4 bullet sản phẩm, mỗi bullet nêu lý do chọn ngắn gọn.
- Với outfit_advice, có thể dùng bullet ngắn để giải thích vì sao chọn từng sản phẩm, vì thẻ sản phẩm bên dưới không có mô tả chi tiết. Mỗi bullet chỉ nên 1 câu ngắn, không quá dài.
- Nếu có nhiều sản phẩm cùng một nhóm, ví dụ toàn áo, hãy nói rõ đây là các lựa chọn áo chính phù hợp và hỏi người dùng có muốn lọc thêm quần hoặc áo khoác để hoàn thiện set không.

Cách trả lời theo intent:
- capability_question: giới thiệu khả năng, kèm vài ví dụ câu hỏi.
- ai_working_explanation: giải thích cách phân tích câu hỏi và dùng dữ liệu sản phẩm thật.
- privacy_memory_question: nói rõ không tự ý tạo đơn/thay đổi tài khoản, dữ liệu mua sắm chỉ dùng để hỗ trợ tư vấn.
- order_creation_question: nói chưa tạo đơn trực tiếp, hướng dẫn người dùng chọn sản phẩm trên website.
- outfit_advice: tư vấn như stylist theo hoàn cảnh và dựng thành 1 set rõ ràng. Nếu có sản phẩm thật từ database, chỉ chọn tối đa 3 đến 4 món tiêu biểu, không liệt kê hết tất cả sản phẩm. Ưu tiên nói theo vai trò: áo chính, quần, áo khoác nhẹ hoặc món bổ sung nếu có. Giải thích ngắn vì sao set này hợp hoàn cảnh.
- search_products/sale_products: tóm tắt kết quả tìm được bằng giọng tự nhiên, nhắc 1 đến 3 điểm nổi bật như giá, sale, màu, size nếu có dữ liệu, rồi gợi ý cách lọc tiếp theo.
- size_advice: tư vấn size dựa trên chiều cao/cân nặng, nhắc đây là gợi ý tham khảo.
- date_question: trả lời ngày/thứ ngắn gọn nếu backend đã cung cấp ngày trong filters hoặc metrics; không gợi ý sản phẩm nếu người dùng chỉ hỏi ngày.
- weather_question: nếu không có dữ liệu thời tiết thời gian thực, nói rõ là hiện chưa có dữ liệu real-time; có thể tư vấn trang phục theo khí hậu chung hoặc hỏi người dùng cung cấp nhiệt độ/nắng/mưa.
- fashion_advice: tư vấn như stylist trước, không tìm sản phẩm ngay nếu người dùng chỉ đang nêu bối cảnh. Với địa điểm biển như Phú Quốc, gợi ý đồ nhẹ, thoáng, dễ vận động như áo thun, sơ mi ngắn tay, quần short, áo khoác chống nắng mỏng. Phụ kiện chỉ nhắc là món có thể tự chuẩn bị thêm nếu cần.
- Với fashion_advice, trả lời bằng 1 đến 2 đoạn ngắn, sau đó hỏi thêm tối đa 2 câu.
- Không dùng các cụm thân mật hơi gượng như "bạn nhỉ", "xả hơi", "tự tin khoe cá tính", "lên đồ cực cháy".
- Ưu tiên cách nói trực tiếp: "Mình gợi ý bạn...", "Bạn nên ưu tiên...", "Các màu... sẽ dễ phối...".
`;

    const prompt = `
Câu hỏi hiện tại:
${userMessage}

Ngữ cảnh hội thoại gần đây:
${conversationText || userMessage}

Intent:
${intent}

Style context:
${JSON.stringify(styleContext || {}, null, 2)}

Size suggestion:
${JSON.stringify(sizeSuggestion || null, null, 2)}

Filters/backend hiểu được:
${JSON.stringify(filters || {}, null, 2)}

Metrics:
${JSON.stringify(metrics || {}, null, 2)}

Sản phẩm thật từ database:
${JSON.stringify(productContext, null, 2)}

Hãy viết câu trả lời cuối cho khách hàng.
`;

    const result = await model.generateContent([systemInstruction, prompt]);
    const text = result?.response?.text?.() || "";

    return text.trim() || null;
  } catch (error) {
    if (CHAT_DEBUG) {
      console.warn("generateAssistantReply error:", error.message);
    }

    return null;
  }
}

function answerPolicyQuestion(message) {
  const text = normalizeText(message);

  if (text.includes("doi tra") || text.includes("đổi trả")) {
    return "Về đổi trả, bạn vui lòng xem mục Chính sách đổi trả ở footer hoặc liên hệ CSKH để xác nhận điều kiện áp dụng cho từng trường hợp nhé.";
  }

  if (
    text.includes("giao hang") ||
    text.includes("van chuyen") ||
    text.includes("ship") ||
    text.includes("bao lau")
  ) {
    return "Về giao hàng và vận chuyển, bạn vui lòng xem mục Chính sách vận chuyển ở footer hoặc liên hệ CSKH để biết thời gian áp dụng theo khu vực nhé.";
  }

  if (text.includes("thanh toan")) {
    return "Về thanh toán, bạn có thể xem thêm ở mục Điều khoản / Chính sách trên website hoặc thử đặt hàng để xem các phương thức hiện có nhé.";
  }

  return "Bạn có thể xem các mục Chính sách ở footer của website. Nếu muốn, mình cũng có thể giúp bạn tìm sản phẩm theo nhu cầu.";
}

function hasAnyNormalizedTerm(text, terms) {
  const normalized = normalizeText(text || "");
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function isGreetingOnly(message) {
  const text = normalizeText(message || "").trim();
  if (!text) return false;

  const compact = text.replace(/[!?.\s]+/g, " ").trim();

  const greetingMatched = GREETING_TERMS.some((term) => {
    const normTerm = normalizeText(term);
    return compact === normTerm || compact.startsWith(`${normTerm} `);
  });

  const shoppingTerms = [
    "tim",
    "mua",
    "ao",
    "quan",
    "size",
    "sale",
    "gia",
    "phoi do",
    "mac gi",
    "san pham",
    "tu van",
  ];

  const hasShoppingSignal = shoppingTerms.some((term) =>
    hasPhrase(compact, term)
  );

  return greetingMatched && !hasShoppingSignal;
}

function isOutfitAdviceQuestion(message) {
  const text = normalizeText(message || "");

  const hasOutfitSignal = hasAnyNormalizedTerm(text, OUTFIT_ADVICE_TERMS);

  const hasContextSignal =
    /\b(1[0-9]|[2-7][0-9]|80)\s*tuoi\b/.test(text) ||
    text.includes("sinh vien") ||
    text.includes("hoc sinh") ||
    text.includes("di hoc") ||
    text.includes("du tiec") ||
    text.includes("sinh nhat") ||
    text.includes("di lam") ||
    text.includes("di choi") ||
    text.includes("di bien") ||
    text.includes("du lich") ||
    text.includes("nghi duong");

  const hasStyleSelectionSignal =
    text.includes("chon giup") ||
    text.includes("chon cho minh") ||
    text.includes("vai mon") ||
    text.includes("phong cach") ||
    text.includes("nang dong") ||
    text.includes("ca tinh") ||
    text.includes("toi gian") ||
    text.includes("lich su") ||
    text.includes("tre trung") ||
    text.includes("set do") ||
    text.includes("goi y set");

  const hasFashionTarget =
    text.includes("nam") ||
    text.includes("nu") ||
    text.includes("ao") ||
    text.includes("quan") ||
    text.includes("do") ||
    text.includes("trang phuc");

  return (
    hasOutfitSignal ||
    hasContextSignal ||
    (hasStyleSelectionSignal && hasFashionTarget)
  );
}

function isTravelContextMessage(message) {
  const text = normalizeText(message || "");

  const hasTravelPlace =
    text.includes("phu quoc") ||
    text.includes("da lat") ||
    text.includes("nha trang") ||
    text.includes("da nang") ||
    text.includes("hoi an") ||
    text.includes("vung tau") ||
    text.includes("di bien") ||
    text.includes("du lich") ||
    text.includes("nghi duong");

  const hasTravelPlanCue =
    text.includes("minh dinh di") ||
    text.includes("toi dinh di") ||
    text.includes("sap di") ||
    text.includes("chuan bi di") ||
    text.includes("du dinh di") ||
    text.includes("cuoi tuan di") ||
    text.includes("di phu quoc") ||
    text.includes("di da lat") ||
    text.includes("di nha trang") ||
    text.includes("di da nang") ||
    text.includes("di bien");

  const hasProductBuyingCue =
    text.includes("mua") ||
    text.includes("san pham") ||
    text.includes("ao") ||
    text.includes("quan") ||
    text.includes("vay") ||
    text.includes("polo") ||
    text.includes("so mi") ||
    text.includes("thun") ||
    text.includes("sale") ||
    text.includes("gia") ||
    text.includes("duoi") ||
    text.includes("tren");

  return hasTravelPlace && hasTravelPlanCue && !hasProductBuyingCue;
}

function wantsConcreteProductSuggestion(message) {
  const text = normalizeText(message || "");

  return includesAnyNormalized(text, [
    "chon giup",
    "chon cho minh",
    "vai mon",
    "goi y vai mon",
    "goi y san pham",
    "san pham cu the",
    "mau nao",
    "mon nao",
    "co mon nao",
    "co ao nao",
    "co san pham nao",
    "tim",
    "mua",
    "duoi",
    "tren",
    "ngan sach",
    "sale",
    "tang qua",
    "qua tang",
    "tang vo",
    "tang ban gai",
    "tang me",
    "qua cho vo",
  ]);
}

function isGeneralWearAdviceQuestion(message) {
  const text = normalizeText(message || "");

  return includesAnyNormalized(text, [
    "nen mac gi",
    "mac gi",
    "nen chon trang phuc",
    "trang phuc nhu the nao",
    "phoi do sao",
    "phoi do nhu the nao",
  ]);
}

function isReasonFollowUpQuestion(message) {
  const text = normalizeText(message || "").trim();

  return [
    "tai sao",
    "tai sao vay",
    "vi sao",
    "sao vay",
    "ly do",
    "ly do gi",
    "tai sao lai chon",
    "vi sao chon",
  ].some((term) => text === term || text.includes(term));
}

function isStandaloneBudgetQuestion(message) {
  const text = normalizeText(message || "");

  const hasBudget =
    hasPriceCue(message) ||
    hasPhrase(text, "toi co") ||
    hasPhrase(text, "minh co") ||
    hasPhrase(text, "ngan sach") ||
    hasPhrase(text, "so tien");

  const hasProductRequest =
    hasPhrase(text, "mua duoc do gi") ||
    hasPhrase(text, "mua duoc gi") ||
    hasPhrase(text, "co the mua") ||
    hasPhrase(text, "san pham nao") ||
    hasPhrase(text, "do gi") ||
    hasPhrase(text, "mon nao");

  return hasBudget && hasProductRequest;
}

function isExplicitSaleQuestion(message) {
  const text = normalizeText(message || "");

  return [...SALE_TERMS].some((term) =>
    text.includes(normalizeText(term))
  );
}

function inferIntentHeuristic(userMessage, parsedIntent = null) {
  const text = normalizeText(userMessage);

  if (META_INTENTS.has(parsedIntent)) {
    return parsedIntent;
  }

  if (parsedIntent === "policy_faq") {
    return "policy_faq";
  }

  if (parsedIntent === "greeting") {
    return "greeting";
  }

  const isDateQuestion =
    text.includes("hom nay la thu may") ||
    text.includes("hom nay thu may") ||
    text.includes("hom nay ngay may") ||
    text.includes("hom nay la ngay may") ||
    text.includes("ngay may") ||
    text.includes("thu may") ||
    text.includes("bay gio la ngay may") ||
    text.includes("bay gio la thu may");

  if (isDateQuestion || parsedIntent === "date_question") {
    return "date_question";
  }

  if (isReasonFollowUpQuestion(userMessage)) {
    return "recommendation_reason_question";
  }

  const isWeatherQuestion =
    text.includes("thoi tiet") ||
    text.includes("troi mua") ||
    text.includes("troi nang") ||
    text.includes("nhiet do") ||
    text.includes("nong khong") ||
    text.includes("lanh khong");

  if (isWeatherQuestion || parsedIntent === "weather_question") {
    return "weather_question";
  }

  const isTravelFashionAdvice =
    (
      text.includes("phu quoc") ||
      text.includes("da lat") ||
      text.includes("nha trang") ||
      text.includes("da nang") ||
      text.includes("hoi an") ||
      text.includes("vung tau") ||
      text.includes("du lich") ||
      text.includes("di bien") ||
      text.includes("mua nay")
    ) &&
    (
      text.includes("mac gi") ||
      text.includes("nen mac") ||
      text.includes("phoi do") ||
      text.includes("outfit")
    );

  if (
    parsedIntent === "fashion_advice" &&
    wantsConcreteProductSuggestion(userMessage)
  ) {
    return "outfit_advice";
  }

  if (
    isTravelFashionAdvice ||
    isTravelContextMessage(userMessage) ||
    parsedIntent === "fashion_advice"
  ) {
    return "fashion_advice";
  }

  if (
    isGeneralWearAdviceQuestion(userMessage) &&
    !wantsConcreteProductSuggestion(userMessage)
  ) {
    return "fashion_advice";
  }

  if (isGreetingOnly(userMessage)) {
    return "greeting";
  }

  const hasHeight =
    /(\d)\s*m\s*(\d{1,2})\b/.test(text) ||
    /\b(1[4-9]\d|2[0-1]\d)\s*cm\b/.test(text);

  const hasWeight = /\b\d{2,3}\s*kg\b/.test(text);

  const askSize =
    text.includes("tu van size") ||
    text.includes("tư vấn size") ||
    text.includes("mac size gi") ||
    text.includes("mặc size gì") ||
    text.includes("size nao") ||
    text.includes("size nào");

  const bodyInfoForOutfit =
    hasHeight &&
    hasWeight &&
    !askSize &&
    includesAnyNormalized(text, [
      "mua do",
      "can mua do",
      "can do",
      "do mac",
      "mac de di",
      "di an sinh nhat",
      "sinh nhat",
      "di tiec",
      "du tiec",
      "di lam",
      "di choi",
      "chon do",
      "chon giup",
      "vai mon",
      "co mon nao",
      "phu hop",
    ]);

  if (bodyInfoForOutfit) {
    return "outfit_advice";
  }

  if (askSize || (hasHeight && hasWeight)) {
    return "size_advice";
  }

  if (
    text.includes("doi tra") ||
    text.includes("đổi trả") ||
    text.includes("giao hang") ||
    text.includes("van chuyen") ||
    text.includes("thanh toan") ||
    text.includes("bao lau") ||
    text.includes("chinh sach")
  ) {
    return "policy_faq";
  }

  if ([...SALE_TERMS].some((term) => text.includes(normalizeText(term)))) {
    return "sale_products";
  }

  if (parsedIntent === "outfit_advice") {
    return "outfit_advice";
  }

  if (isOutfitAdviceQuestion(userMessage)) {
    if (
      isGeneralWearAdviceQuestion(userMessage) &&
      !wantsConcreteProductSuggestion(userMessage)
    ) {
      return "fashion_advice";
    }

    return "outfit_advice";
  }



  return "search_products";
}

function cleanKeywordArray(keywords, color = null) {
  if (!Array.isArray(keywords)) return null;

  let aliases = [];
  if (color && COLOR_ALIASES[color]) {
    aliases = COLOR_ALIASES[color].map((a) => normalizeText(a));
  }

  const seen = new Set();

  const cleaned = keywords
    .map((k) => (k || "").toString().trim())
    .filter(Boolean)
    .filter((k) => {
      const norm = normalizeText(k);

      if (STOPWORDS.has(norm)) return false;
      if (GENERIC_WORDS.has(norm)) return false;
      if (color && aliases.includes(norm)) return false;
      if (isPriceLikeToken(norm)) return false;
      if (norm.length < 3) return false;
      if (seen.has(norm)) return false;

      seen.add(norm);
      return true;
    });

  return cleaned.length ? cleaned : null;
}

function filterKeywordsForSizeAdvice(keywords) {
  if (!Array.isArray(keywords)) return null;
  const filtered = keywords.filter((k) => {
    const norm = normalizeText(k);
    if (BODY_TERMS.has(norm)) return false;
    if (isPriceLikeToken(norm)) return false;
    return true;
  });
  return filtered.length ? filtered : null;
}

function filterKeywordsForSale(keywords) {
  if (!Array.isArray(keywords)) return null;

  const saleQuestionNoise = new Set([
    "nhieu",
    "nhiều",
    "nhat",
    "nhất",
    "bao",
    "bao nhieu",
    "phan",
    "phần",
    "tram",
    "trăm",
    "sau",
    "sâu",
    "muc",
    "mức",
    "nao",
    "nào",
    "%",
    "cai",
    "cái",
    "co",
    "có",
    "hang",
    "hàng",
    "do",
    "đồ",
    "ao",
    "áo",
    "quan",
    "quần",
    "san",
    "sản",
    "pham",
    "phẩm",
    "san pham",
    "sản phẩm",
    "khong",
    "không",
    "dang",
    "đang",
  ]);

  const tokens = keywords
    .flatMap((keyword) =>
      String(keyword || "")
        .split(/[\s,./\-+]+/)
        .map((token) => token.trim())
        .filter(Boolean)
    );

  const filtered = tokens.filter((token) => {
    const norm = normalizeText(token);

    if (!norm) return false;
    if (SALE_TERMS.has(norm)) return false;
    if (saleQuestionNoise.has(norm)) return false;
    if (STOPWORDS.has(norm)) return false;
    if (GENERIC_WORDS.has(norm)) return false;
    if (isPriceLikeToken(norm)) return false;
    if (norm.length < 3) return false;

    return true;
  });

  return filtered.length ? [...new Set(filtered)] : null;
}

async function detectCategorySlugFromText(text) {
  const { categories } = await loadMeta();

  const textNorm = normalizePhrase(text);

  // Match trực tiếp theo tên hoặc slug trong database
  for (const category of categories) {
    const nameNorm = normalizePhrase(category.name || "");
    const slugNorm = normalizePhrase(category.slug || "");

    if (nameNorm && textNorm.includes(nameNorm)) {
      return category.slug;
    }

    if (slugNorm && textNorm.includes(slugNorm)) {
      return category.slug;
    }

    // Cho phép câu ngắn hơn tên category, ví dụ "áo sơ mi" match "Áo Sơ Mi Nam"
    if (nameNorm && nameNorm.includes(textNorm) && textNorm.length >= 5) {
      return category.slug;
    }
  }

  // Match theo alias tự định nghĩa
  for (const group of CATEGORY_ALIASES) {
    const matchedAlias = group.aliases.some((alias) => hasPhrase(text, alias));

    if (!matchedAlias) continue;

    const found = categories.find((category) => {
      const slugNorm = normalizePhrase(category.slug || "");
      const nameNorm = normalizePhrase(category.name || "");

      return group.slugCandidates.some((candidate) => {
        const candidateNorm = normalizePhrase(candidate);

        const slugMatched =
          slugNorm === candidateNorm ||
          slugNorm.includes(candidateNorm);

        const nameMatched =
          nameNorm === candidateNorm ||
          nameNorm.includes(candidateNorm);

        const aliasMatched = group.aliases.some((alias) => {
          const aliasNorm = normalizePhrase(alias);
          return (
            nameNorm === aliasNorm ||
            nameNorm.includes(aliasNorm)
          );
        });

        return slugMatched || nameMatched || aliasMatched;
      });
    });

    if (found?.slug) {
      return found.slug;
    }
  }

  return null;
}

function findCategorySlugByTerms(categories = [], terms = []) {
  const normalizedTerms = terms.map((term) => normalizePhrase(term)).filter(Boolean);

  const scored = (categories || [])
    .map((category) => {
      const slug = normalizePhrase(category.slug || "");
      const name = normalizePhrase(category.name || "");
      const haystack = `${slug} ${name}`;

      let score = 0;

      for (const term of normalizedTerms) {
        if (!term) continue;

        if (slug === term) score += 100;
        if (name === term) score += 90;
        if (slug.includes(term)) score += 50 + term.length;
        if (name.includes(term)) score += 40 + term.length;
        if (haystack.includes(term)) score += 20 + term.length;
      }

      return {
        category,
        score,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.category?.slug || null;
}

function isJeansQuery(message) {
  const text = normalizePhrase(message || "");

  return [
    "quan jeans",
    "quan jean",
    "quần jeans",
    "quần jean",
    "jeans",
    "jean",
    "denim",
  ].some((term) => hasPhrase(text, term));
}

function isGenericPantsQuery(message) {
  const text = normalizePhrase(message || "");

  const hasPants = hasPhrase(text, "quan") || hasPhrase(text, "quần");

  const hasSpecificPantsType = [
    "jean",
    "jeans",
    "denim",
    "short",
    "kaki",
    "tay",
    "tây",
    "jogger",
  ].some((term) => hasPhrase(text, term));

  return hasPants && !hasSpecificPantsType;
}

function resolveCategoryOverrideFromMessage(message, categories = []) {
  if (isJeansQuery(message)) {
    return (
      findCategorySlugByTerms(categories, [
        "quan jeans nam",
        "quan jean nam",
        "quan jeans",
        "quan jean",
        "jeans",
        "jean",
      ]) || "quan-jeans-nam"
    );
  }

  return null;
}

async function semanticCategoryBrand(textLower) {
  const { categories, brands } = await loadMeta();
  const textNorm = normalizeText(textLower);
  const textPhrase = normalizePhrase(textLower);

  let categorySlug = await detectCategorySlugFromText(textLower);

  if (!categorySlug) {
    for (const c of categories) {
      const n = normalizePhrase(c.name || "");
      const s = normalizePhrase(c.slug || "");

      if (
        (n && textPhrase.includes(n)) ||
        (s && textPhrase.includes(s))
      ) {
        categorySlug = c.slug;
        break;
      }
    }
  }

  let brand = null;
  for (const b of brands) {
    if (textNorm.includes(normalizeText(b || ""))) {
      brand = b;
      break;
    }
  }

  return { categorySlug, brand };
}

async function callGeminiForFilters(userMessage) {
  if (!genAI) return null;

  try {
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const systemInstruction = `
Bạn là bộ phân tích truy vấn tìm sản phẩm thời trang. Chỉ trả JSON hợp lệ:
{
 "intent":"search_products"|"size_advice"|"sale_products"|"outfit_advice"|"greeting"|"policy_faq"|"capability_question"|"ai_working_explanation"|"privacy_memory_question"|"model_question"|"order_creation_question"|"date_question"|"weather_question"|"fashion_advice"|"other",
 "keywords": string[]|null,
 "categorySlug": string|null,
 "brand": string|null,
 "color": string|null,
 "size": string|null,
 "gender":"nam"|"nu"|"unisex"|null,
 "minPrice": number|null,
 "maxPrice": number|null,
 "sortBy":"price"|"relevance"|"discount"|null,
 "sortOrder":"asc"|"desc"|null
}
Chuyển k/ngàn/nghìn = *1000, triệu/tr = *1_000_000.
Không đưa các từ chỉ giá như "dưới", "trên", "khoảng", "400k" vào keywords nếu đã hiểu thành min/max price.
Nếu người dùng đang hỏi tư vấn size, đặt intent là "size_advice".
Nếu người dùng hỏi sản phẩm sale / giảm giá, đặt intent là "sale_products".
Nếu người dùng hỏi mặc gì, phối đồ, outfit, đi học, đi chơi, đi làm, dự tiệc, sinh nhật, quà tặng và có ý định xem/gợi ý sản phẩm cụ thể, đặt intent là "outfit_advice".
Nếu người dùng nói "chọn giúp", "vài món", "phối set", "phong cách năng động", "phong cách cá tính", "tối giản", "lịch sự" và có nhắc đến nam/nữ/trang phục, đặt intent là "outfit_advice".
Nếu người dùng hỏi tư vấn mặc gì theo địa điểm, mùa, thời tiết hoặc du lịch nhưng chưa yêu cầu sản phẩm cụ thể, đặt intent là "fashion_advice".
Nếu người dùng nhắc nam, con trai, đàn ông, bạn trai, đặt gender là "nam".
Nếu người dùng nhắc nữ, con gái, phụ nữ, bạn gái, đặt gender là "nu".
Nếu người dùng nói "vợ", "vợ tôi", "bạn gái", "mẹ", "chị", "em gái", đặt gender là "nu".
Nếu người dùng nói "chồng", "bạn trai", "bố", "ba", "anh trai", "em trai", đặt gender là "nam".
Không được hiểu chữ "năm" trong "năm nay", "40 năm", "50 năm" là giới tính nam.
Nếu người dùng nói "năm nay 40 tuổi", đây là tuổi, không phải gender nam.
Nếu người dùng hỏi quà tặng cho vợ/bạn gái/mẹ, ưu tiên sản phẩm nữ như váy, chân váy, áo nữ, áo khoác nữ nếu database có.
Nếu người dùng nhắc unisex, đặt gender là "unisex".
Nếu người dùng hỏi bạn làm được gì, hỗ trợ gì, chức năng gì, đặt intent là "capability_question".
Nếu người dùng hỏi bạn hoạt động như thế nào, hiểu câu hỏi ra sao, xử lý dữ liệu thế nào, đặt intent là "ai_working_explanation".
Nếu người dùng hỏi lưu lịch sử, bộ nhớ, dữ liệu cá nhân, bảo mật, đặt intent là "privacy_memory_question".
Nếu người dùng hỏi dùng mô hình AI gì, model gì, Gemini/GPT/LLM, đặt intent là "model_question".
Nếu người dùng hỏi tạo đơn, đặt hàng giúp, checkout giúp, đặt intent là "order_creation_question".
Nếu người dùng hỏi đổi trả, vận chuyển, thanh toán, chính sách, đặt intent là "policy_faq".
Nếu người dùng hỏi hôm nay ngày mấy, thứ mấy, ngày hiện tại, thời gian hiện tại, đặt intent là "date_question".
Nếu người dùng hỏi thời tiết hiện tại, thời tiết ở một địa điểm, trời mưa/nắng/nóng/lạnh ở đâu đó, đặt intent là "weather_question".
Nếu người dùng hỏi đi Phú Quốc, đi Đà Lạt, đi biển, du lịch mùa này nên mặc gì nhưng chưa yêu cầu sản phẩm cụ thể, đặt intent là "fashion_advice".
Nếu người dùng chỉ nói đang định đi du lịch, sắp đi một địa điểm như Phú Quốc, Đà Lạt, Nha Trang, Đà Nẵng nhưng chưa hỏi mua sản phẩm cụ thể, đặt intent là "fashion_advice".
Nếu người dùng chỉ cung cấp bối cảnh chuyến đi như "mình định đi Phú Quốc", hãy đặt intent là "fashion_advice", không đặt "search_products".
Không thêm giải thích ngoài JSON.`;

    const prompt = `Người dùng: "${userMessage}"\nJSON:`;
    const r = await model.generateContent([systemInstruction, prompt]);
    const raw = (r?.response?.text?.() || "").trim();

    if (CHAT_DEBUG) console.log("Gemini raw:", raw);

    const match = raw.match(/\{[\s\S]*\}$/m);
    if (!match) return null;

    return JSON.parse(match[0]);
  } catch (e) {
    if (CHAT_DEBUG) console.warn("Gemini parse error:", e.message);
    return null;
  }
}

function detectRelationshipGender(message) {
  const raw = String(message || "").toLowerCase();

  const femaleRaw =
    raw.includes("vợ") ||
    raw.includes("bạn gái") ||
    raw.includes("mẹ") ||
    raw.includes("má") ||
    raw.includes("chị gái") ||
    raw.includes("em gái");

  const femaleNoTone = [
    "vo toi",
    "vo minh",
    "vo cua toi",
    "vo nam nay",
    "tang vo",
    "tang qua cho vo",
    "qua cho vo",
    "ban gai",
    "me toi",
    "me minh",
    "chi gai",
    "em gai",
  ].some((phrase) => hasPhrase(message, phrase));

  if (femaleRaw || femaleNoTone) {
    return "nu";
  }

  const maleRaw =
    raw.includes("chồng") ||
    raw.includes("bạn trai") ||
    raw.includes("bố") ||
    raw.includes("ba") ||
    raw.includes("cha") ||
    raw.includes("anh trai") ||
    raw.includes("em trai");

  const maleNoTone = [
    "chong toi",
    "chong minh",
    "chong cua toi",
    "tang chong",
    "tang qua cho chong",
    "qua cho chong",
    "ban trai",
    "bo toi",
    "ba toi",
    "cha toi",
    "anh trai",
    "em trai",
  ].some((phrase) => hasPhrase(message, phrase));

  if (maleRaw || maleNoTone) {
    return "nam";
  }

  return null;
}

function extractGenderFilterFromText(message) {
  const raw = String(message || "").toLowerCase();

  const relationshipGender = detectRelationshipGender(message);
  if (relationshipGender) {
    return relationshipGender;
  }

  if (
    /\b(nam|male)\b/i.test(raw) ||
    raw.includes("con trai") ||
    raw.includes("đàn ông") ||
    raw.includes("dan ong") ||
    raw.includes("bạn trai") ||
    raw.includes("ban trai")
  ) {
    return "nam";
  }

  if (
    /\b(nữ|nu|female)\b/i.test(raw) ||
    raw.includes("con gái") ||
    raw.includes("con gai") ||
    raw.includes("phụ nữ") ||
    raw.includes("phu nu") ||
    raw.includes("bạn gái") ||
    raw.includes("ban gai")
  ) {
    return "nu";
  }

  if (raw.includes("unisex")) {
    return "unisex";
  }

  return null;
}

async function fallbackParse(userMessage) {
  const lower = userMessage.toLowerCase();
  const color = normalizeColor(lower);
  const { minPrice, maxPrice } = extractPrices(lower);
  const size = extractSizes(lower);
  const { categorySlug, brand } = await semanticCategoryBrand(lower);
  const gender = extractGenderFilterFromText(userMessage);

  let tokens = userMessage
    .split(/[\s,./\-+]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  tokens = cleanKeywordArray(tokens, color);

  return {
    intent: "search_products",
    keywords: tokens,
    categorySlug: categorySlug || null,
    brand: brand || null,
    color,
    size,
    gender,
    minPrice: minPrice || null,
    maxPrice: maxPrice || null,
    sortBy: null,
    sortOrder: null,
  };
}

function finalSizePrice(sizeObj) {
  if (
    sizeObj.discountPrice !== undefined &&
    sizeObj.discountPrice !== null &&
    sizeObj.discountPrice > 0
  ) {
    return sizeObj.discountPrice;
  }
  return sizeObj.price;
}

function isSizeOnSale(sizeObj) {
  return (
    sizeObj &&
    Number(sizeObj.discountPrice) > 0 &&
    Number(sizeObj.price) > Number(sizeObj.discountPrice)
  );
}

function getDiscountPercentOfSize(sizeObj) {
  if (!isSizeOnSale(sizeObj)) return 0;
  return Math.round(
    (1 - Number(sizeObj.discountPrice) / Number(sizeObj.price)) * 100
  );
}

function scoreProduct(p, filters) {
  let score = 0;
  const m = p._matching;

  if (filters.keywords && filters.keywords.length) {
    const nameL = normalizeText(p.name || "");
    const descL = normalizeText(p.shortDescription || "");
    const brandL = normalizeText(p.brand || "");
    const tagsL = (p.tags || []).map((t) => normalizeText(t || ""));

    filters.keywords.forEach((k) => {
      const kw = normalizeText(k);
      if (nameL.includes(kw)) score += 15;
      if (descL.includes(kw)) score += 8;
      if (brandL.includes(kw)) score += 10;
      if (tagsL.some((t) => t.includes(kw))) score += 8;
    });
  }

  if (filters.color && m.colorMatched) score += 25;
  if (filters.size && m.sizeMatched) score += 20;

  if (m.discountPercent >= 30) score += 12;
  else if (m.discountPercent >= 15) score += 6;
  else if (m.discountPercent >= 5) score += 2;

  if (filters.minPrice || filters.maxPrice) {
    const min = filters.minPrice || m.finalPrice;
    const max = filters.maxPrice || m.finalPrice;
    const mid = (min + max) / 2;
    const diff = Math.abs(m.finalPrice - mid);
    const span = max - min || mid || 1;
    const closeness = 1 - diff / span;
    score += Math.max(0, closeness * 20);
  }

  if (filters.saleOnly && m.discountPercent > 0) {
    score += 10 + Math.min(20, m.discountPercent);
  }

  return score;
}

function normalizeProductGenderFilter(gender) {
  const normalized = normalizeText(gender || "");

  if (normalized === "nam" || normalized === "male") return "nam";
  if (normalized === "nu" || normalized === "nữ" || normalized === "female") return "nu";
  if (normalized === "unisex") return "unisex";

  return null;
}

async function getCategoryAndDescendantIdsBySlug(categorySlug) {
  if (!categorySlug) return [];

  const rootCategory = await Category.findOne({ slug: categorySlug }).lean();
  if (!rootCategory) return [];

  const resultIds = [rootCategory._id];
  let currentLevelIds = [rootCategory._id];

  while (currentLevelIds.length) {
    const children = await Category.find(
      { parentId: { $in: currentLevelIds } },
      "_id"
    ).lean();

    if (!children.length) break;

    const childIds = children.map((item) => item._id);
    resultIds.push(...childIds);
    currentLevelIds = childIds;
  }

  return resultIds;
}

async function queryProducts(filters, pagination) {
  const {
    keywords,
    categorySlug,
    brand,
    color,
    size,
    minPrice,
    maxPrice,
    sortBy,
    sortOrder = "desc",
    saleOnly = false,
    gender,
  } = filters;

  const { page = 1, limit = 30 } = pagination;
  const productFilter = { status: "active" };
  const normalizedGender = normalizeProductGenderFilter(gender);

  if (normalizedGender === "nam") {
    productFilter.gender = { $in: ["nam", "unisex"] };
  } else if (normalizedGender === "nu") {
    productFilter.gender = { $in: ["nu", "unisex"] };
  } else if (normalizedGender === "unisex") {
    productFilter.gender = "unisex";
  }

  function emptyResult() {
    return { total: 0, page, limit, products: [] };
  }

  if (categorySlug) {
    const categoryIds = await getCategoryAndDescendantIdsBySlug(categorySlug);

    if (!categoryIds.length) {
      return emptyResult();
    }

    productFilter.categoryId = { $in: categoryIds };
  }

  if (brand) {
    productFilter.brand = new RegExp(`^${escapeRegex(brand)}$`, "i");
  }

  if (color) {
    const aliasList = COLOR_ALIASES[color] || [color];
    const colorRegex = new RegExp(
      `^(${aliasList.map(escapeRegex).join("|")})$`,
      "i"
    );

    const variantColorDocs = await ProductVariant.find(
      { color: colorRegex },
      "productId"
    ).lean();

    if (!variantColorDocs.length) return emptyResult();

    const productIds = [
      ...new Set(variantColorDocs.map((v) => v.productId.toString())),
    ];
    productFilter._id = { $in: productIds };
  }

  const strongKeywords = cleanKeywordArray(keywords, color) || null;

  if (strongKeywords && strongKeywords.length) {
    const orClauses = [];

    strongKeywords.forEach((k) => {
      const r = new RegExp(escapeRegex(k), "i");
      orClauses.push({ name: r });
      orClauses.push({ shortDescription: r });
      orClauses.push({ brand: r });
      orClauses.push({ tags: { $in: [r] } });
    });

    productFilter.$or = orClauses;
  }

  let baseProducts = await Product.find(productFilter)
    .populate("categoryId", "name slug")
    .limit(200)
    .lean();

  if ((!baseProducts || !baseProducts.length) && strongKeywords && strongKeywords.length) {
    const looserFilter = { status: "active" };

    if (productFilter.categoryId) looserFilter.categoryId = productFilter.categoryId;
    if (productFilter.brand) looserFilter.brand = productFilter.brand;
    if (productFilter._id) looserFilter._id = productFilter._id;

    baseProducts = await Product.find(looserFilter)
      .populate("categoryId", "name slug")
      .limit(200)
      .lean();
  }

  if (!baseProducts || !baseProducts.length) return emptyResult();

  const idMap = baseProducts.map((p) => p._id);
  const variants = await ProductVariant.find({ productId: { $in: idMap } }).lean();

  const variantsByProduct = variants.reduce((acc, v) => {
    const key = v.productId.toString();
    (acc[key] = acc[key] || []).push(v);
    return acc;
  }, {});

  const enriched = [];

  for (const product of baseProducts) {
    const key = product._id.toString();

    const allVariants = (variantsByProduct[key] || []).filter(
      (v) =>
        Array.isArray(v.sizes) &&
        v.sizes.some((s) => (s.stock || 0) > 0)
    );

    if (!allVariants.length) continue;

    let candidates = allVariants;
    let colorMatchedVariant = null;

    if (color) {
      const aliasList = COLOR_ALIASES[color] || [color];
      colorMatchedVariant = candidates.find((v) =>
        aliasList.includes((v.color || "").toLowerCase())
      );
      if (colorMatchedVariant) candidates = [colorMatchedVariant];
    }

    let selectedVariant = null;
    let selectedSize = null;
    let sizeMatched = false;

    if (size) {
      const requested = Array.isArray(size)
        ? size.map((s) => normalizeSizeToken(s))
        : [normalizeSizeToken(size)];

      for (const v of candidates) {
        const s = (v.sizes || []).find((sz) => {
          if (!sz.size || !requested.includes(normalizeSizeToken(sz.size))) return false;
          if ((sz.stock || 0) <= 0) return false;
          if (saleOnly && !isSizeOnSale(sz)) return false;
          return true;
        });

        if (s) {
          selectedVariant = v;
          selectedSize = s;
          sizeMatched = true;
          break;
        }
      }
    }

    if (!selectedVariant) {
      candidates.forEach((v) => {
        (v.sizes || []).forEach((s) => {
          if ((s.stock || 0) <= 0) return;
          if (saleOnly && !isSizeOnSale(s)) return;

          const fp = finalSizePrice(s);
          if (!selectedVariant) {
            selectedVariant = v;
            selectedSize = s;
            return;
          }

          if (saleOnly) {
            const currentDiscount = getDiscountPercentOfSize(selectedSize);
            const nextDiscount = getDiscountPercentOfSize(s);

            if (
              nextDiscount > currentDiscount ||
              (nextDiscount === currentDiscount &&
                fp < finalSizePrice(selectedSize))
            ) {
              selectedVariant = v;
              selectedSize = s;
            }
          } else {
            if (fp < finalSizePrice(selectedSize)) {
              selectedVariant = v;
              selectedSize = s;
            }
          }
        });
      });
    }

    if (!selectedVariant || !selectedSize) continue;

    const fp = finalSizePrice(selectedSize);
    if (minPrice && fp < minPrice) continue;
    if (maxPrice && fp > maxPrice) continue;

    const discountPercent = getDiscountPercentOfSize(selectedSize);

    const availableColors = [
      ...new Set(allVariants.map((v) => v.color).filter(Boolean)),
    ];

    const availableSizes = [
      ...new Set(
        allVariants.flatMap((v) => (v.sizes || []).map((s) => s.size)).filter(Boolean)
      ),
    ];

    enriched.push({
      _id: product._id,
      name: product.name,
      slug: product.slug,
      brand: product.brand,
      gender: product.gender || "unisex",
      material: product.material || "",
      shortDescription: product.shortDescription || "",
      tags: Array.isArray(product.tags) ? product.tags : [],
      category: product.categoryId,
      variant: {
        variantId: selectedVariant._id,
        color: selectedVariant.color,
        colorCode: selectedVariant.colorCode,
        images: selectedVariant.images,
        chosenSize: {
          size: selectedSize.size,
          price: selectedSize.price,
          discountPrice: selectedSize.discountPrice,
          finalPrice: fp,
        },
        sizes: (selectedVariant.sizes || [])
          .filter((s) => (s.stock || 0) > 0)
          .map((s) => ({
            size: s.size,
            stock: s.stock,
            price: s.price,
            discountPrice: s.discountPrice,
            finalPrice: finalSizePrice(s),
          })),
      },
      finalPrice: fp,
      originalPrice: selectedSize.price,
      discountPrice: selectedSize.discountPrice,
      discountPercent,
      availableColors,
      availableSizes,
      _matching: {
        finalPrice: fp,
        colorMatched: !!colorMatchedVariant,
        sizeMatched,
        discountPercent,
      },
    });
  }

  const importantKeywords = (strongKeywords || []).filter((k) => {
    const norm = normalizeText(k);
    if (GENERIC_WORDS.has(norm)) return false;
    if (STOPWORDS.has(norm)) return false;
    if (isPriceLikeToken(norm)) return false;
    return norm.length >= 3;
  });

  if (importantKeywords.length && !filters.categorySlug) {
    for (let i = enriched.length - 1; i >= 0; i--) {
      const p = enriched[i];
      const nameN = normalizeText(p.name || "");
      const descN = normalizeText(p.shortDescription || "");
      const brandN = normalizeText(p.brand || "");
      const tagsN = (p.tags || []).map((t) => normalizeText(t || ""));

      let matchCount = 0;

      importantKeywords.forEach((mk) => {
        const mkN = normalizeText(mk);
        if (
          nameN.includes(mkN) ||
          descN.includes(mkN) ||
          brandN.includes(mkN) ||
          tagsN.some((t) => t.includes(mkN))
        ) {
          matchCount += 1;
        }
      });

      const needed = importantKeywords.length >= 3 ? 2 : 1;
      if (matchCount < needed) enriched.splice(i, 1);
    }
  }

  enriched.forEach((p) => {
    p._score = scoreProduct(p, {
      ...filters,
      keywords: strongKeywords,
    });
  });

  if (sortBy === "price") {
    enriched.sort((a, b) =>
      sortOrder === "asc" ? a.finalPrice - b.finalPrice : b.finalPrice - a.finalPrice
    );
  } else if (sortBy === "discount") {
    enriched.sort((a, b) =>
      sortOrder === "asc"
        ? a.discountPercent - b.discountPercent
        : b.discountPercent - a.discountPercent
    );
  } else {
    enriched.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return a.finalPrice - b.finalPrice;
    });
  }

  const start = (page - 1) * limit;
  const slice = enriched.slice(start, start + limit);

  return {
    total: enriched.length,
    page,
    limit,
    products: slice.map((p) => {
      const { _matching, _score, ...rest } = p;
      return {
        ...rest,
        relevanceScore: _score,
        match: {
          colorMatched: _matching.colorMatched,
          sizeMatched: _matching.sizeMatched,
        },
      };
    }),
  };
}

async function inferCategoryFromKeywords(parsed, userMessage = "") {
  if (!parsed) return parsed;

  if (parsed.categorySlug) {
    const exactCategory = await Category.findOne({
      slug: parsed.categorySlug,
    }).lean();

    if (exactCategory) {
      return parsed;
    }

    // Gemini đôi khi trả slug chung như "ao-polo",
    // trong khi database dùng slug cụ thể như "ao-polo-nam".
    // Nếu slug Gemini không tồn tại, backend tự detect lại từ câu hỏi.
    parsed.categorySlug = null;
  }

  const detectedFromMessage = await detectCategorySlugFromText(userMessage);
  if (detectedFromMessage) {
    parsed.categorySlug = detectedFromMessage;
    return parsed;
  }

  const joinedKeywords = (parsed.keywords || []).join(" ");
  const detectedFromKeywords = await detectCategorySlugFromText(joinedKeywords);

  if (detectedFromKeywords) {
    parsed.categorySlug = detectedFromKeywords;
    return parsed;
  }

  return parsed;
}

function mergeFilters(prev, next) {
  if (!prev) return next;

  const merged = { ...prev };

  if (next.keywords && next.keywords.length) {
    const set = new Set([...(prev.keywords || []), ...next.keywords]);
    merged.keywords = [...set];
  }

  if (!next.keywords && prev.keywords) merged.keywords = prev.keywords;

  if (next.categorySlug) merged.categorySlug = next.categorySlug;
  if (next.brand) merged.brand = next.brand;
  if (next.color) merged.color = next.color;
  if (next.size) merged.size = next.size;
  if (next.gender) merged.gender = next.gender;

  if (next.minPrice != null) merged.minPrice = next.minPrice;
  if (next.maxPrice != null) merged.maxPrice = next.maxPrice;

  if (next.sortBy) merged.sortBy = next.sortBy;
  if (next.sortOrder) merged.sortOrder = next.sortOrder;
  if (next.saleOnly != null) merged.saleOnly = next.saleOnly;
  if (next.intent) merged.intent = next.intent;

  return merged;
}
function hasCurrentProductAnchor(parsed) {
  return Boolean(
    parsed?.categorySlug ||
    parsed?.brand ||
    parsed?.gender ||
    (Array.isArray(parsed?.keywords) && parsed.keywords.length > 0)
  );
}

function hasOnlyRefinement(parsed) {
  if (!parsed) return false;

  const hasRefinement = Boolean(
    parsed.color ||
    parsed.size ||
    parsed.minPrice != null ||
    parsed.maxPrice != null ||
    parsed.sortBy ||
    parsed.sortOrder ||
    parsed.saleOnly
  );

  return hasRefinement && !hasCurrentProductAnchor(parsed);
}

function shouldKeepPreviousFilters(userMessage, parsed, previousFilters) {
  if (isStandaloneBudgetQuestion(userMessage)) {
    return false;
  }

  if (isExplicitSaleQuestion(userMessage)) {
    return false;
  }

  if (parsed?.intent === "sale_products" || parsed?.intent === "size_advice") {
    return false;
  }

  if (!previousFilters) return false;

  const text = normalizeText(userMessage || "");

  // Các câu follow-up kiểu "vậy có món nào phù hợp" phải giữ context cũ,
  // kể cả khi Gemini parse ra keyword rác hoặc category "váy".
  if (isStyleFollowUpMessage(userMessage)) {
    return true;
  }



  // Nếu câu mới có anchor sản phẩm rõ ràng thì coi là truy vấn mới.
  if (hasCurrentProductAnchor(parsed)) return false;

  const newQueryTerms = [
    "ao polo",
    "polo",
    "ao so mi",
    "so mi",
    "ao thun",
    "thun",
    "ao khoac",
    "quan short",
    "short",
    "quan dai",
    "quan jean",
    "jean",
    "do the thao",
    "phu kien",
    "san pham nao",
    "co san pham",
    "co ao",
    "co quan",
  ];

  if (newQueryTerms.some((term) => text.includes(term))) {
    return false;
  }

  const hasSaleTerm = [...SALE_TERMS].some((term) =>
    text.includes(normalizeText(term))
  );

  const broadSaleTerms = [
    "cai nao",
    "co cai nao",
    "co ao nao",
    "co quan nao",
    "co san pham nao",
    "san pham nao",
    "hang nao",
    "do nao",
  ];

  const isBroadSaleQuestion =
    hasSaleTerm &&
    (
      broadSaleTerms.some((term) => text.includes(term)) ||
      !hasCurrentProductAnchor(parsed)
    );

  if (isBroadSaleQuestion) {
    return false;
  }

  const followUpCues = [
    "thoi",
    "nua",
    "them",
    "tiep",
    "con",
    "cai do",
    "mau",
    "size",
    "kich co",
    "duoi",
    "tren",
    "tam",
    "khoang",
    "gia",
    "vay",
    "mon",
    "cac mon",
    "do nao",
    "mon nao",
    "phu hop",
    "cho minh",
    "chon tiep",
    "co mon nao",
    "co do nao",
  ];

  if (hasOnlyRefinement(parsed)) return true;

  const hasFollowUpCue = followUpCues.some((cue) => text.includes(cue));

  if (hasFollowUpCue && !hasCurrentProductAnchor(parsed)) {
    return true;
  }

  return false;
}

function removeFilterKeys(filters, keys) {
  const next = { ...filters };

  keys.forEach((key) => {
    delete next[key];
  });

  return next;
}

async function queryProductsWithRelaxation(filters, pagination) {
  const exactResult = await queryProducts(filters, pagination);

  if (exactResult.products.length > 0) {
    return {
      result: exactResult,
      filters,
      relaxed: false,
      relaxedMessage: "",
    };
  }

  const relaxSteps = [
    {
      keys: ["size"],
      message: "bỏ điều kiện size",
    },
    {
      keys: ["color"],
      message: "nới bớt điều kiện màu sắc",
    },
    {
      keys: ["minPrice", "maxPrice"],
      message: "nới khoảng giá",
    },
    {
      keys: ["size", "color", "minPrice", "maxPrice"],
      message: "chỉ giữ lại loại sản phẩm chính",
    },
  ];

  for (const step of relaxSteps) {
    const hasAnyKey = step.keys.some((key) => filters[key] !== undefined && filters[key] !== null);

    if (!hasAnyKey) continue;

    const relaxedFilters = removeFilterKeys(filters, step.keys);
    const relaxedResult = await queryProducts(relaxedFilters, pagination);

    if (relaxedResult.products.length > 0) {
      return {
        result: relaxedResult,
        filters: relaxedFilters,
        relaxed: true,
        relaxedMessage: step.message,
      };
    }
  }

  return {
    result: exactResult,
    filters,
    relaxed: false,
    relaxedMessage: "",
  };
}

function cleanParsedKeywordsInPlace(parsed) {
  parsed.keywords = cleanKeywordArray(parsed.keywords, parsed.color);
}

function extractStyleContext(message) {
  const text = normalizeText(message || "");

  let occasion = null;
  let customerType = null;
  let age = null;
  let gender = null;

  const ageMatch = text.match(/\b(1[0-9]|[2-7][0-9]|80)\s*tuoi\b/);
  if (ageMatch) age = Number(ageMatch[1]);

  const relationshipGender = detectRelationshipGender(message);

  if (relationshipGender) {
    gender = relationshipGender;
  } else {
    const raw = String(message || "").toLowerCase();

    if (
      /\b(nữ|nu|female)\b/i.test(raw) ||
      raw.includes("con gái") ||
      raw.includes("con gai") ||
      raw.includes("phụ nữ") ||
      raw.includes("phu nu") ||
      raw.includes("bạn gái") ||
      raw.includes("ban gai")
    ) {
      gender = "nu";
    } else if (
      /\b(nam|male)\b/i.test(raw) ||
      raw.includes("con trai") ||
      raw.includes("đàn ông") ||
      raw.includes("dan ong") ||
      raw.includes("bạn trai") ||
      raw.includes("ban trai")
    ) {
      gender = "nam";
    }
  }

  if (text.includes("sinh vien")) customerType = "sinh viên";
  else if (text.includes("hoc sinh")) customerType = "học sinh";
  else if (text.includes("di lam") || text.includes("cong so")) {
    customerType = "đi làm";
  }

  if (text.includes("di bien")) occasion = "đi biển";
  else if (text.includes("du lich") || text.includes("nghi duong")) {
    occasion = "du lịch";
  } else if (text.includes("sinh nhat")) {
    occasion = "dự tiệc sinh nhật";
  } else if (text.includes("du tiec")) {
    occasion = "dự tiệc";
  } else if (text.includes("di hoc")) {
    occasion = "đi học";
  } else if (text.includes("di lam")) {
    occasion = "đi làm";
  } else if (text.includes("di choi") || text.includes("cuoi tuan")) {
    occasion = "đi chơi";
  } else if (text.includes("qua tang")) {
    occasion = "quà tặng";
  }

  return {
    occasion,
    customerType,
    age,
    gender,
  };
}

function mergeStyleContext(baseContext = {}, currentContext = {}) {
  return {
    occasion: currentContext.occasion || baseContext.occasion || null,
    customerType: currentContext.customerType || baseContext.customerType || null,
    age: currentContext.age || baseContext.age || null,
    gender: currentContext.gender || baseContext.gender || null,
  };
}

function hasUsefulStyleContext(context = {}) {
  return Boolean(
    context.occasion ||
    context.customerType ||
    context.age ||
    context.gender
  );
}

function isStyleFollowUpMessage(message) {
  const text = normalizeText(message || "");

  return [
    "chon cho minh",
    "chon giup",
    "vai mon",
    "goi y vai mon",
    "chon vai mon",
    "mau nao phu hop",
    "mon nao phu hop",
    "vay co mon nao phu hop",
    "vậy có món nào phù hợp",
    "co mon nao phu hop",
    "có món nào phù hợp",
    "co do nao phu hop",
    "có đồ nào phù hợp",
    "mon nao hop",
    "món nào hợp",
    "theo huong do",
    "nhu tren",
    "goi y tiep",
    "phoi thanh set",
    "set do",
  ].some((term) => text.includes(normalizeText(term)));
}

function isCategoryRefinementFollowUp(message) {
  const text = normalizePhrase(message || "");
  if (!text) return false;

  const tokens = text.split(" ").filter(Boolean);
  const shortEnough = tokens.length <= 7;

  const hasCategoryCue = [
    "quan",
    "quan dai",
    "quan tay",
    "quan jean",
    "quan jeans",
    "jean",
    "jeans",
    "kaki",
    "short",
    "ao",
    "ao polo",
    "polo",
    "ao so mi",
    "so mi",
    "ao thun",
    "thun",
    "ao khoac",
  ].some((term) => hasPhrase(text, term));

  const hasFollowUpCue = [
    "co",
    "khong",
    "nua",
    "them",
    "nao",
    "mau nao",
    "loai nao",
  ].some((term) => hasPhrase(text, term));

  return hasCategoryCue && (shortEnough || hasFollowUpCue);
}

function getStyleContextForCurrentMessage(userMessage, recentUserMessages = []) {
  const currentContext = extractStyleContext(userMessage);

  if (!isStyleFollowUpMessage(userMessage)) {
    return currentContext;
  }

  const normalizedCurrent = normalizeText(userMessage || "");

  const previousUserMessage = [...recentUserMessages]
    .reverse()
    .find((message) => {
      const content = String(message || "").trim();
      if (!content) return false;
      if (normalizeText(content) === normalizedCurrent) return false;

      const context = extractStyleContext(content);
      return hasUsefulStyleContext(context);
    });

  if (!previousUserMessage) {
    return currentContext;
  }

  const previousContext = extractStyleContext(previousUserMessage);

  return mergeStyleContext(previousContext, currentContext);
}

function getOutfitSearchPlans(message, styleContext = {}) {
  const text = normalizeText(message || "");
  const genderFilter = styleContext.gender ? { gender: styleContext.gender } : {};
  const isFemaleContext =
    styleContext.gender === "nu" ||
    text.includes("ban gai") ||
    text.includes("con gai") ||
    text.includes("phu nu");

  const isMaleContext =
    styleContext.gender === "nam" ||
    text.includes("ban trai") ||
    text.includes("con trai") ||
    text.includes("dan ong");

  const maleOnlyCategory = (slug) =>
    styleContext.gender === "nu" ? null : slug;

  const withOptionalCategory = (slug, extra = {}) => ({
    ...extra,
    ...(slug ? { categorySlug: slug } : {}),
  });
  const genderAwareCategory = (maleSlug) =>
    styleContext.gender === "nu" ? "nu" : maleSlug;

  const wantsJeans =
    text.includes("quan jean") ||
    text.includes("quan jeans") ||
    text.includes("jean") ||
    text.includes("jeans") ||
    text.includes("denim");

  const wantsPants =
    wantsJeans ||
    hasPhrase(text, "quan") ||
    text.includes("quan dai") ||
    text.includes("quan tay") ||
    text.includes("kaki");

  if (wantsJeans) {
    return [
      {
        label:
          styleContext.gender === "nam"
            ? "quần jeans nam dễ mặc và dễ phối"
            : "quần jeans dễ phối",
        filters: withOptionalCategory(genderAwareCategory("quan-jeans-nam"), {
          intent: "search_products",
          keywords: null,
          ...genderFilter,
        }),
      },
      {
        label: "quần denim hoặc quần jeans dự phòng",
        filters: {
          intent: "search_products",
          keywords: ["jeans"],
          ...genderFilter,
        },
      },
      {
        label: "quần jean dự phòng",
        filters: {
          intent: "search_products",
          keywords: ["jean"],
          ...genderFilter,
        },
      },
    ];
  }

  if (wantsPants) {
    return [
      {
        label:
          styleContext.gender === "nam"
            ? "quần nam dễ mặc hằng ngày"
            : "quần dễ mặc hằng ngày",
        filters: withOptionalCategory(genderAwareCategory("quan-dai"), {
          intent: "search_products",
          keywords: null,
          ...genderFilter,
        }),
      },
      {
        label: "quần short thoải mái, dễ vận động",
        filters: withOptionalCategory(genderAwareCategory("quan-short"), {
          intent: "search_products",
          keywords: ["short"],
          ...genderFilter,
        }),
      },
      {
        label: "quần jeans hoặc quần dài dự phòng",
        filters: {
          intent: "search_products",
          keywords: ["quần"],
          ...genderFilter,
        },
      },
    ];
  }

  if (
    isFemaleContext &&
    (
      text.includes("qua tang") ||
      text.includes("tang") ||
      text.includes("di choi") ||
      text.includes("cuoi tuan")
    )
  ) {
    return [
      {
        label: "váy hoặc chân váy nữ dễ mặc khi đi chơi",
        filters: {
          intent: "search_products",
          categorySlug: "nu",
          gender: "nu",
          keywords: ["váy", "chân váy"],
        },
      },
      {
        label: "áo nữ thanh lịch dễ tặng",
        filters: {
          intent: "search_products",
          categorySlug: "nu",
          gender: "nu",
          keywords: ["sơ mi", "polo"],
        },
      },
    ];
  }

  if (
    isMaleContext &&
    (
      text.includes("qua tang") ||
      text.includes("tang") ||
      text.includes("di choi") ||
      text.includes("cuoi tuan")
    )
  ) {
    return [
      {
        label: "trang phục nam dễ mặc khi đi chơi",
        filters: {
          intent: "search_products",
          categorySlug: "nam",
          gender: "nam",
          keywords: null,
        },
      },
    ];
  }

  if (
    text.includes("nang dong") ||
    text.includes("the thao") ||
    text.includes("active") ||
    text.includes("sport") ||
    text.includes("tre trung")
  ) {
    return [
      {
        label: "áo thun hoặc áo thể thao năng động",
        filters: {
          intent: "search_products",
          categorySlug: styleContext.gender === "nu" ? "nu" : "ao-thun-nam",
          keywords: ["thun", "thể thao"],
          ...genderFilter,
        },
      },
      {
        label: "áo polo dễ vận động",
        filters: {
          intent: "search_products",
          categorySlug: styleContext.gender === "nu" ? "nu" : "ao-polo-nam",
          keywords: ["polo"],
          ...genderFilter,
        },
      },
      {
        label: "áo khoác trẻ trung",
        filters: {
          intent: "search_products",
          keywords: ["khoác", "bomber"],
          ...genderFilter,
        },
      },
      {
        label: "quần short dễ phối",
        filters: {
          intent: "search_products",
          categorySlug: "quan-short",
          keywords: ["short"],
          ...genderFilter,
        },
      },
    ];
  }

  if (text.includes("di bien") || text.includes("du lich") || text.includes("nghi duong")) {
    return [
      {
        label: "áo sơ mi hoặc áo khoác nhẹ đi biển",
        filters: withOptionalCategory(maleOnlyCategory("ao-so-mi-nam"), {
          intent: "search_products",
          keywords: ["sơ mi"],
          ...genderFilter,
        }),
      },
      {
        label: "áo thun hoặc polo thoáng mát",
        filters: withOptionalCategory(maleOnlyCategory("ao-thun-nam"), {
          intent: "search_products",
          keywords: ["thun"],
          ...genderFilter,
        }),
      },
      {
        label: "quần short dễ vận động",
        filters: withOptionalCategory(maleOnlyCategory("quan-short"), {
          intent: "search_products",
          keywords: ["short"],
          ...genderFilter,
        }),
      },
    ];
  }

  if (
    text.includes("ao so mi") ||
    text.includes("so mi") ||
    text.includes("somi") ||
    text.includes("shirt")
  ) {
    return [
      {
        label: "áo sơ mi phù hợp",
        filters: {
          intent: "search_products",
          categorySlug: styleContext.gender === "nu" ? "nu" : "ao-so-mi-nam",
          keywords: ["sơ mi"],
          ...genderFilter,
        },
      },
      {
        label: "áo polo dễ phối cùng",
        filters: {
          intent: "search_products",
          categorySlug: styleContext.gender === "nu" ? "nu" : "ao-polo-nam",
          keywords: ["polo"],
          ...genderFilter,
        },
      },
    ];
  }

  if (text.includes("ao polo") || text.includes("polo")) {
    return [
      {
        label: "áo polo phù hợp",
        filters: {
          intent: "search_products",
          categorySlug: styleContext.gender === "nu" ? "nu" : "ao-polo-nam",
          keywords: ["polo"],
          ...genderFilter,
        },
      },
      {
        label: "áo sơ mi dễ phối",
        filters: {
          intent: "search_products",
          categorySlug: styleContext.gender === "nu" ? "nu" : "ao-so-mi-nam",
          keywords: ["sơ mi"],
          ...genderFilter,
        },
      },
    ];
  }

  if (text.includes("ao thun") || text.includes("thun") || text.includes("tshirt")) {
    return [
      {
        label: "áo thun dễ mặc",
        filters: {
          intent: "search_products",
          categorySlug: genderAwareCategory("ao-thun-nam"),
          keywords: ["thun"],
          ...genderFilter,
        },
      },
      {
        label: "áo polo dễ phối",
        filters: {
          intent: "search_products",
          categorySlug: genderAwareCategory("ao-polo-nam"),
          keywords: ["polo"],
          ...genderFilter,
        },
      },
    ];
  }

  if (text.includes("quan short") || text.includes("short")) {
    return [
      {
        label: "quần short dễ vận động",
        filters: {
          intent: "search_products",
          categorySlug: "quan-short",
          keywords: ["short"],
          ...genderFilter,
        },
      },
      {
        label: "đồ thể thao dễ phối",
        filters: {
          intent: "search_products",
          categorySlug: "the-thao",
          keywords: null,
          ...genderFilter,
        },
      },
    ];
  }

  if (text.includes("sinh nhat") || text.includes("du tiec")) {
    if (styleContext.gender === "nu") {
      return [
        {
          label: "váy hoặc chân váy nữ đi sinh nhật",
          filters: {
            intent: "search_products",
            categorySlug: "nu",
            gender: "nu",
            keywords: ["váy", "chân váy"],
          },
        },
        {
          label: "áo nữ thanh lịch đi sinh nhật",
          filters: {
            intent: "search_products",
            categorySlug: "nu",
            gender: "nu",
            keywords: ["sơ mi", "polo"],
          },
        },
      ];
    }

    return [
      {
        label: "áo sơ mi lịch sự",
        filters: {
          intent: "search_products",
          categorySlug: genderAwareCategory("ao-so-mi-nam"),
          keywords: ["sơ mi"],
          ...genderFilter,
        },
      },
      {
        label: "áo polo tối giản",
        filters: {
          intent: "search_products",
          categorySlug: genderAwareCategory("ao-polo-nam"),
          keywords: ["polo"],
          ...genderFilter,
        },
      },
    ];
  }

  if (text.includes("di hoc") || text.includes("sinh vien")) {
    return [
      {
        label: "áo polo dễ mặc",
        filters: {
          intent: "search_products",
          categorySlug: genderAwareCategory("ao-polo-nam"),
          keywords: ["polo"],
          ...genderFilter,
        },
      },
      {
        label: "áo thun basic",
        filters: {
          intent: "search_products",
          categorySlug: genderAwareCategory("ao-thun-nam"),
          keywords: ["thun"],
          ...genderFilter,
        },
      },
    ];
  }

  if (text.includes("the thao") || text.includes("gym") || text.includes("chay bo")) {
    return [
      {
        label: "đồ thể thao phù hợp",
        filters: {
          intent: "search_products",
          categorySlug: "the-thao",
          keywords: null,
          ...genderFilter,
        },
      },
      {
        label: "sản phẩm thể thao dự phòng",
        filters: {
          intent: "search_products",
          keywords: ["thể thao"],
          ...genderFilter,
        },
      },
    ];
  }

  if (text.includes("qua tang")) {
    return [
      {
        label:
          styleContext.gender === "nu"
            ? "trang phục nữ dễ tặng"
            : "áo polo dễ tặng",
        filters: {
          intent: "search_products",
          categorySlug: genderAwareCategory("ao-polo-nam"),
          keywords: styleContext.gender === "nu" ? ["polo", "váy"] : ["polo"],
          ...genderFilter,
        },
      },
      {
        label:
          styleContext.gender === "nu"
            ? "áo hoặc váy nữ dễ mặc"
            : "áo sơ mi dễ mặc",
        filters: {
          intent: "search_products",
          categorySlug: genderAwareCategory("ao-so-mi-nam"),
          keywords: styleContext.gender === "nu" ? ["sơ mi", "váy"] : ["sơ mi"],
          ...genderFilter,
        },
      },
    ];
  }

  return [
    {
      label: "áo polo dễ mặc",
      filters: {
        intent: "search_products",
        categorySlug: genderAwareCategory("ao-polo-nam"),
        keywords: ["polo"],
        ...genderFilter,
      },
    },
    {
      label: "áo sơ mi lịch sự",
      filters: {
        intent: "search_products",
        categorySlug: genderAwareCategory("ao-so-mi-nam"),
        keywords: ["sơ mi"],
        ...genderFilter,
      },
    },
  ];
}

async function queryOutfitAdviceProducts(userMessage, pagination, styleContext = {}) {
  const plans = getOutfitSearchPlans(userMessage, styleContext);
  const products = [];
  const seen = new Set();

  for (const plan of plans) {
    const result = await queryProducts(plan.filters, {
      page: 1,
      limit: 4,
    });

    result.products.forEach((product) => {
      const id = String(product._id || product.slug || "");
      if (!id || seen.has(id)) return;

      seen.add(id);
      products.push({
        ...product,
        outfitReason: plan.label,
      });
    });
  }

  const limit = Math.min(12, Math.max(1, Number(pagination.limit) || 6));

  return {
    total: products.length,
    page: 1,
    limit,
    products: products.slice(0, limit),
  };
}

function buildOutfitAdviceReply(userMessage, styleContext = {}, products = []) {
  const parts = [];

  if (styleContext.gender === "nu") {
    parts.push("nữ");
  } else if (styleContext.gender === "nam") {
    parts.push("nam");
  }

  if (styleContext.age) {
    parts.push(`khoảng ${styleContext.age} tuổi`);
  }

  if (styleContext.occasion) {
    parts.push(`đi ${styleContext.occasion.replace(/^đi\s+/i, "")}`);
  }

  const targetText = parts.length ? parts.join(", ") : "theo nhu cầu của bạn";

  const hasProducts = Array.isArray(products) && products.length > 0;

  const text = normalizeText(userMessage || "");

  const isGiftQuery =
    text.includes("tang") ||
    text.includes("tang qua") ||
    text.includes("qua tang") ||
    text.includes("qua cho") ||
    text.includes("mua do cho chong") ||
    text.includes("mua cho chong") ||
    text.includes("do cho chong") ||
    text.includes("cho chong") ||
    text.includes("mua do cho vo") ||
    text.includes("mua cho vo") ||
    text.includes("do cho vo") ||
    text.includes("cho vo");

  const isGiftForWife =
    styleContext.gender === "nu" ||
    text.includes("vo") ||
    text.includes("ban gai") ||
    text.includes("me");

  const isGiftForHusband =
    styleContext.gender === "nam" ||
    text.includes("chong") ||
    text.includes("ban trai") ||
    text.includes("bo") ||
    text.includes("ba");

  if (hasProducts && isGiftQuery && isGiftForWife) {
    return "Với quà tặng cho vợ, mình ưu tiên các món dễ mặc, màu sắc nhẹ nhàng và ít kén dáng. Các sản phẩm bên dưới phù hợp để tặng vì có thể dùng trong nhiều dịp, dễ phối và có lý do gợi ý riêng để bạn cân nhắc.";
  }

  if (hasProducts && isGiftQuery && isGiftForHusband) {
    return "Với quà tặng cho chồng, mình ưu tiên các món dễ mặc, dễ phối và an toàn về phong cách như áo polo, sơ mi, quần dài hoặc quần short. Các sản phẩm bên dưới phù hợp để tặng vì dễ dùng trong nhiều dịp và có lý do gợi ý riêng để bạn cân nhắc.";
  }

  if (
    hasProducts &&
    styleContext.gender === "nu" &&
    styleContext.age &&
    styleContext.occasion === "dự tiệc sinh nhật"
  ) {
    return `Với nhu cầu chọn đồ đi sinh nhật cho nữ khoảng ${styleContext.age} tuổi, mình ưu tiên các món có màu nhẹ, dễ mặc và vẫn đủ chỉn chu. Các sản phẩm bên dưới phù hợp để đi ăn hoặc gặp mặt bạn bè, dễ phối và có lý do gợi ý riêng để bạn cân nhắc.`;
  }

  if (
    styleContext.gender === "nu" &&
    styleContext.age &&
    styleContext.occasion === "đi làm"
  ) {
    return hasProducts
      ? `Với nhu cầu chọn trang phục đi làm cho nữ khoảng ${styleContext.age} tuổi, mình ưu tiên các món có phom dáng thoải mái, lịch sự và không quá ôm. Các sản phẩm bên dưới dễ mặc, màu sắc tương đối nhã nhặn và phù hợp với môi trường công sở.`
      : `Với nhu cầu chọn trang phục đi làm cho nữ khoảng ${styleContext.age} tuổi, bạn nên ưu tiên áo sơ mi form suông, áo polo có cổ, quần ống đứng hoặc chân váy dáng gọn. Các màu như trắng, be, xanh navy, xám hoặc pastel nhẹ sẽ giúp tổng thể lịch sự nhưng vẫn trẻ trung vừa phải.`;
  }

  if (styleContext.occasion === "đi làm") {
    return hasProducts
      ? `Mình chọn một vài sản phẩm theo hướng gọn gàng, lịch sự và dễ mặc khi đi làm. Bạn có thể xem các lựa chọn bên dưới để cân nhắc theo màu sắc, chất liệu và mức giá.`
      : `Khi đi làm, bạn nên ưu tiên trang phục có phom dáng gọn, chất liệu thoải mái và màu sắc dễ phối. Áo sơ mi, áo polo basic, quần ống đứng hoặc áo khoác nhẹ là những lựa chọn an toàn.`;
  }

  if (hasProducts) {
    return `Mình chọn một vài sản phẩm phù hợp với nhu cầu của bạn. Các lựa chọn bên dưới ưu tiên sự dễ mặc, dễ phối và có lý do gợi ý riêng để bạn cân nhắc.`;
  }

  return "Mình gợi ý bạn ưu tiên trang phục có phom dáng vừa vặn, chất liệu thoải mái và màu sắc dễ phối. Nếu muốn mình chọn sản phẩm cụ thể, bạn có thể cho mình biết thêm giới tính, độ tuổi, hoàn cảnh mặc và ngân sách.";
}

function isBroadSaleQuery(message) {
  const text = normalizeText(message || "");

  const hasSaleTerm = [...SALE_TERMS].some((term) =>
    text.includes(normalizeText(term))
  );

  if (!hasSaleTerm) return false;

  const broadTerms = [
    "co cai nao",
    "cai nao",
    "co mon nao",
    "mon nao",
    "co do nao",
    "do nao",
    "co hang nao",
    "hang nao",
    "co san pham nao",
    "san pham nao",
    "co ao nao",
    "ao nao",
    "co quan nao",
    "quan nao",
    "dang sale",
    "dang giam gia",
    "co gi sale",
    "co gi giam",
  ];

  return broadTerms.some((term) => text.includes(term));
}

function pickDiverseOutfitProducts(products, maxItems = 4) {
  if (!Array.isArray(products) || !products.length) return [];

  const picked = [];
  const seenIds = new Set();
  const seenReasons = new Set();

  for (const product of products) {
    const id = String(product._id || product.id || product.slug || product.name || "");
    const reason = normalizeText(product.outfitReason || "");

    if (!id || seenIds.has(id)) continue;

    if (reason && seenReasons.has(reason)) continue;

    picked.push(product);
    seenIds.add(id);
    if (reason) seenReasons.add(reason);

    if (picked.length >= maxItems) return picked;
  }

  for (const product of products) {
    const id = String(product._id || product.id || product.slug || product.name || "");

    if (!id || seenIds.has(id)) continue;

    picked.push(product);
    seenIds.add(id);

    if (picked.length >= maxItems) return picked;
  }

  return picked;
}

exports.chatSearch = async (req, res) => {
  try {
    const { messages, page, limit, sortBy, sortOrder, contextFilters } = req.body || {};

    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ message: "messages required" });
    }

    const userMessage = messages[messages.length - 1].content || "";
    if (!userMessage.trim()) {
      return res.status(400).json({ message: "empty user message" });
    }

    const conversationText = messages
      .slice(-8)
      .map((message) => message.content || "")
      .join("\n");

    const recentUserMessages = messages
      .filter((message) => {
        const role = message?.role || message?.sender;
        return !role || role === "user";
      })
      .map((message) => message.content || "")
      .filter(Boolean)
      .slice(-4);

    let parsed = await callGeminiForFilters(userMessage);
    if (!parsed) parsed = await fallbackParse(userMessage);

    const lower = userMessage.toLowerCase();
    const shouldInferCategoryFromMessage = hasSpecificCategoryCue(userMessage);
    const { categorySlug, brand } = await semanticCategoryBrand(lower);
    const { categories } = await loadMeta();

    if (shouldInferCategoryFromMessage && !parsed.categorySlug && categorySlug) {
      parsed.categorySlug = categorySlug;
    }

    const categoryOverride = resolveCategoryOverrideFromMessage(userMessage, categories);

    if (categoryOverride) {
      parsed.categorySlug = categoryOverride;
      parsed.keywords = null;
    }

    if (isGenericPantsQuery(userMessage) && !categoryOverride) {
      parsed.categorySlug = null;
      parsed.keywords = ["quần"];
    }

    if (
      isCategoryRefinementFollowUp(userMessage) &&
      ["nam", "nu", "unisex"].includes(parsed.categorySlug)
    ) {
      parsed.categorySlug = null;
    }

    if (!parsed.brand && brand) {
      parsed.brand = brand;
    }

    if (!parsed.gender) {
      const detectedGender = extractGenderFilterFromText(userMessage);
      if (detectedGender) parsed.gender = detectedGender;
    }

    if (parsed.color) {
      const norm = normalizeColor(parsed.color.toLowerCase());
      if (norm) parsed.color = norm;
    } else {
      let autoColor = normalizeColor(lower);
      if (!autoColor) {
        const dyn = await dynamicColorDetect(lower);
        if (dyn) autoColor = dyn;
      }
      if (autoColor) parsed.color = autoColor;
    }

    parsed.intent = inferIntentHeuristic(userMessage, parsed.intent);
    cleanParsedKeywordsInPlace(parsed);

    const keepPreviousFilters = shouldKeepPreviousFilters(
      userMessage,
      parsed,
      contextFilters
    );

    let merged = keepPreviousFilters
      ? mergeFilters(contextFilters, parsed)
      : parsed;

    if (merged.intent !== "sale_products") {
      delete merged.saleOnly;

      if (merged.sortBy === "discount") {
        delete merged.sortBy;
        delete merged.sortOrder;
      }
    }

    if (!merged.minPrice && !merged.maxPrice) {
      const { minPrice, maxPrice } = extractPrices(lower);
      if (minPrice) merged.minPrice = minPrice;
      if (maxPrice) merged.maxPrice = maxPrice;
    }

    if (merged.size) {
      if (Array.isArray(merged.size)) {
        merged.size = merged.size.map((s) => normalizeSizeToken(s));
      } else {
        merged.size = normalizeSizeToken(merged.size);
      }
    }

    if (sortBy) merged.sortBy = sortBy;
    if (sortOrder) merged.sortOrder = sortOrder;

    const currentMessageGender = extractGenderFilterFromText(userMessage);
    if (currentMessageGender) {
      merged.gender = currentMessageGender;
    }

    const previousContextGender =
      contextFilters?.gender || contextFilters?.styleContext?.gender || null;

    if (
      !merged.gender &&
      previousContextGender &&
      isCategoryRefinementFollowUp(userMessage)
    ) {
      merged.gender = previousContextGender;
    }

    if (
      isCategoryRefinementFollowUp(userMessage) &&
      !isStyleFollowUpMessage(userMessage) &&
      !isStandaloneBudgetQuestion(userMessage) &&
      !isExplicitSaleQuestion(userMessage)
    ) {
      merged.intent = "search_products";

      if (!hasExplicitSizeCue(userMessage)) {
        delete merged.size;
        delete merged.sizeSuggestion;
      }

      if (!hasPriceCue(userMessage)) {
        delete merged.minPrice;
        delete merged.maxPrice;
      }
    }

    if (isStandaloneBudgetQuestion(userMessage)) {
      delete merged.gender;
      delete merged.size;
      delete merged.categorySlug;
      delete merged.sizeSuggestion;
      merged.keywords = null;
    }

    if (isExplicitSaleQuestion(userMessage)) {
      merged.intent = "sale_products";
    }

    if (
      isStyleFollowUpMessage(userMessage) &&
      !hasSpecificCategoryCue(userMessage) &&
      !isStandaloneBudgetQuestion(userMessage) &&
      !isExplicitSaleQuestion(userMessage)
    ) {
      merged.intent = "outfit_advice";
      delete merged.categorySlug;

      if (!merged.color && contextFilters?.color) {
        merged.color = contextFilters.color;
      }

      if (!merged.gender && contextFilters?.gender) {
        merged.gender = contextFilters.gender;
      }

      if (!hasExplicitSizeCue(userMessage)) {
        delete merged.size;
        delete merged.sizeSuggestion;
      }

      merged.keywords = null;
    }

    if (!merged.gender && !isStandaloneBudgetQuestion(userMessage)) {
      const styleContextForGender = getStyleContextForCurrentMessage(
        userMessage,
        recentUserMessages
      );

      if (
        styleContextForGender.gender &&
        (
          isStyleFollowUpMessage(userMessage) ||
          isCategoryRefinementFollowUp(userMessage) ||
          shouldKeepPreviousFilters(userMessage, parsed, contextFilters)
        )
      ) {
        merged.gender = styleContextForGender.gender;
      }
    }

    if (
      ["nam", "nu", "unisex"].includes(merged.categorySlug) &&
      !hasSpecificCategoryCue(userMessage)
    ) {
      delete merged.categorySlug;
    }

    if (
      merged.gender === "nu" &&
      typeof merged.categorySlug === "string" &&
      /(^|-)nam($|-)/.test(merged.categorySlug)
    ) {
      delete merged.categorySlug;
    }

    if (
      merged.gender === "nam" &&
      typeof merged.categorySlug === "string" &&
      /(^|-)nu($|-)/.test(merged.categorySlug)
    ) {
      delete merged.categorySlug;
    }

    const currentMessageColor = normalizeColor(lower);
    const currentMessageHasColorCue =
      currentMessageColor ||
      normalizeText(userMessage || "").includes("mau ") ||
      normalizeText(userMessage || "").includes("màu ");

    if (!currentMessageHasColorCue && hasCurrentProductAnchor(merged)) {
      delete merged.color;
    }

    if (
      shouldInferCategoryFromMessage &&
      ![
        "date_question",
        "weather_question",
        "fashion_advice",
        "capability_question",
        "ai_working_explanation",
        "privacy_memory_question",
        "model_question",
        "order_creation_question",
        "greeting",
        "policy_faq",
      ].includes(merged.intent)
    ) {
      await inferCategoryFromKeywords(merged, userMessage);
    }
    if (
      [
        "date_question",
        "weather_question",
        "fashion_advice",
        "capability_question",
        "ai_working_explanation",
        "privacy_memory_question",
        "model_question",
        "order_creation_question",
        "greeting",
        "policy_faq",
      ].includes(merged.intent)
    ) {
      delete merged.keywords;
      delete merged.categorySlug;
      delete merged.brand;
      delete merged.color;
      delete merged.size;
      delete merged.minPrice;
      delete merged.maxPrice;
      delete merged.sortBy;
      delete merged.sortOrder;
      delete merged.saleOnly;
    }

    if (["outfit_advice", "fashion_advice"].includes(merged.intent)) {
      if (!hasPriceCue(userMessage)) {
        delete merged.minPrice;
        delete merged.maxPrice;
      }

      if (!hasExplicitSizeCue(userMessage)) {
        delete merged.size;
      }

      if (
        !hasSpecificCategoryCue(userMessage) ||
        ["nam", "nu", "unisex"].includes(merged.categorySlug)
      ) {
        delete merged.categorySlug;
      }
    }

    if (CHAT_DEBUG) {
      console.log("[CHAT_DEBUG] merged filters =>", merged);
    }

    if (merged.intent === "date_question") {
      const now = new Date();

      const dateText = new Intl.DateTimeFormat("vi-VN", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(now);

      return res.json({
        reply: `Hôm nay là ${dateText}. Nếu bạn đang lên lịch đi chơi hoặc du lịch, mình có thể gợi ý trang phục phù hợp theo hoàn cảnh.`,
        filters: merged,
        products: [],
        metrics: { total: 0, page: 1, limit: 0 },
      });
    }

    if (merged.intent === "weather_question") {
      const aiReply = await generateAssistantReply({
        userMessage,
        conversationText,
        intent: "weather_question",
        products: [],
        filters: merged,
        metrics: { total: 0, page: 1, limit: 0 },
      });

      return res.json({
        reply:
          aiReply ||
          "Hiện tại mình chưa có dữ liệu thời tiết theo thời gian thực. Bạn có thể kiểm tra thời tiết trên ứng dụng thời tiết, rồi gửi mình nhiệt độ hoặc tình trạng nắng/mưa, mình sẽ gợi ý trang phục phù hợp hơn.",
        filters: merged,
        products: [],
        metrics: { total: 0, page: 1, limit: 0 },
      });
    }

    if (merged.intent === "fashion_advice") {
      const styleContext = getStyleContextForCurrentMessage(
        userMessage,
        recentUserMessages
      );

      const aiReply = await generateAssistantReply({
        userMessage,
        conversationText,
        intent: "fashion_advice",
        products: [],
        filters: {
          ...merged,
          styleContext,
        },
        metrics: { total: 0, page: 1, limit: 0 },
        styleContext,
      });

      const fallbackReply = (() => {
        if (styleContext.gender === "nu" && styleContext.age && styleContext.occasion === "đi làm") {
          return `Với nữ khoảng ${styleContext.age} tuổi đi làm, bạn nên ưu tiên trang phục lịch sự nhưng vẫn thoải mái: áo sơ mi form suông, áo polo có cổ, áo khoác nhẹ hoặc quần ống đứng. Các màu như trắng, be, xanh navy, xám hoặc pastel nhẹ sẽ dễ phối và tạo cảm giác trẻ trung vừa phải. Nên tránh đồ quá ôm, quá nhiều chi tiết hoặc màu quá chói nếu môi trường làm việc cần sự chỉn chu.`;
        }

        if (styleContext.gender === "nu" && styleContext.age) {
          return `Với nữ khoảng ${styleContext.age} tuổi, bạn nên ưu tiên phom dáng thoải mái, màu sắc nhã nhặn và chất liệu dễ mặc. Áo sơ mi mềm, áo polo basic, quần suông, chân váy chữ A hoặc áo khoác nhẹ là những lựa chọn dễ ứng dụng, vừa gọn gàng vừa không bị quá già.`;
        }

        return "Bạn nên ưu tiên trang phục có phom dáng vừa vặn, chất liệu thoải mái và màu sắc dễ phối. Nếu muốn lịch sự, hãy chọn áo sơ mi, áo polo basic, quần ống đứng hoặc áo khoác nhẹ. Nếu muốn trẻ trung hơn, có thể dùng màu sáng nhẹ hoặc pastel thay vì màu quá tối.";
      })();

      return res.json({
        reply: aiReply || fallbackReply,
        filters: {
          ...merged,
          styleContext,
        },
        products: [],
        metrics: { total: 0, page: 1, limit: 0 },
      });
    }

    if (META_INTENTS.has(merged.intent)) {
      const aiReply = await generateAssistantReply({
        userMessage,
        conversationText,
        intent: merged.intent,
        products: [],
        filters: merged,
        metrics: { total: 0, page: 1, limit: 0 },
      });

      return res.json({
        reply:
          aiReply ||
          buildMetaIntentReply(merged.intent) ||
          "Mình có thể hỗ trợ bạn tìm sản phẩm, tư vấn size và gợi ý phối đồ theo nhu cầu.",
        filters: merged,
        products: [],
        metrics: { total: 0, page: 1, limit: 0 },
      });
    }

    if (merged.intent === "greeting") {
      return res.json({
        reply:
          "Xin chào! Mình là trợ lý mua sắm của MATEWEAR. Bạn có thể hỏi mình tìm sản phẩm theo giá, màu, size, sản phẩm sale, hoặc nhờ mình tư vấn outfit theo hoàn cảnh như đi học, đi làm, đi chơi hay dự tiệc.",
        filters: merged,
        products: [],
        metrics: { total: 0, page: 1, limit: 0 },
      });
    }

    if (merged.intent === "policy_faq") {
      return res.json({
        reply: answerPolicyQuestion(userMessage),
        filters: merged,
        products: [],
        metrics: { total: 0, page: 1, limit: 0 },
      });
    }

    if (merged.intent === "outfit_advice") {
      const styleContext = getStyleContextForCurrentMessage(
        userMessage,
        recentUserMessages
      );

      if (CHAT_DEBUG) {
        console.log("[CHAT_DEBUG] styleContext =>", styleContext);
      }

      const outfitResult = await queryOutfitAdviceProducts(
        userMessage,
        {
          page: Math.max(1, Number(page) || 1),
          limit: Math.min(100, Math.max(1, Number(limit) || 6)),
        },
        styleContext
      );

      let outfitProducts = pickDiverseOutfitProducts(outfitResult.products, 4);

      outfitProducts = attachProductReasons(
        outfitProducts,
        styleContext,
        {
          ...merged,
          intent: "outfit_advice",
        }
      );
      if (CHAT_DEBUG) {
        console.log(
          "[CHAT_DEBUG] outfit products =>",
          outfitProducts.map((p) => ({
            name: p.name,
            gender: p.gender,
            reason: p.reason || p.outfitReason,
          }))
        );
      }

      const outfitFilters = {
        ...merged,
        intent: "outfit_advice",
        styleContext,
      };

      const fallbackReply = buildOutfitAdviceReply(
        userMessage,
        styleContext,
        outfitProducts
      );

      return res.json({
        reply: fallbackReply,
        filters: outfitFilters,
        products: outfitProducts,
        metrics: {
          total: outfitProducts.length,
          page: outfitResult.page,
          limit: outfitProducts.length,
        },
      });
    }

    if (merged.intent === "size_advice") {
      const body = extractBodyInfo(userMessage);

      if (!body.heightCm || !body.weightKg) {
        const fallbackReply = buildSizeAdviceReply(body, null, 0);

        const aiReply = await generateAssistantReply({
          userMessage,
          conversationText,
          intent: "size_advice",
          products: [],
          filters: merged,
          metrics: { total: 0, page: 1, limit: 0 },
          sizeSuggestion: null,
        });

        return res.json({
          reply: aiReply || fallbackReply,
          filters: merged,
          products: [],
          metrics: { total: 0, page: 1, limit: 0 },
        });
      }

      const suggestedSize = recommendSizeFromBody(body);

      const sizeFilters = {
        ...merged,
        size: suggestedSize,
        keywords: filterKeywordsForSizeAdvice(merged.keywords),
      };

      if (body.gender === "female") {
        sizeFilters.gender = "nu";
      } else if (body.gender === "male") {
        sizeFilters.gender = "nam";
      }

      delete sizeFilters.sizeSuggestion;

      if (
        ["nam", "nu", "unisex"].includes(sizeFilters.categorySlug) ||
        !hasSpecificCategoryCue(userMessage)
      ) {
        delete sizeFilters.categorySlug;
      }

      if (
        sizeFilters.gender === "nu" &&
        typeof sizeFilters.categorySlug === "string" &&
        /(^|-)nam($|-)/.test(sizeFilters.categorySlug)
      ) {
        delete sizeFilters.categorySlug;
      }

      if (
        sizeFilters.gender === "nam" &&
        typeof sizeFilters.categorySlug === "string" &&
        /(^|-)nu($|-)/.test(sizeFilters.categorySlug)
      ) {
        delete sizeFilters.categorySlug;
      }

      const result = await queryProducts(sizeFilters, {
        page: Math.max(1, Number(page) || 1),
        limit: Math.min(100, Math.max(1, Number(limit) || 6)),
      });

      const responseFilters = {
        ...sizeFilters,
        sizeSuggestion: suggestedSize,
      };

      const responseProducts = attachProductReasons(
        result.products,
        {},
        responseFilters
      );

      const fallbackReply = buildSizeAdviceReply(
        body,
        suggestedSize,
        result.total
      );

      const aiReply = await generateAssistantReply({
        userMessage,
        conversationText,
        intent: "size_advice",
        products: responseProducts,
        filters: responseFilters,
        metrics: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
        sizeSuggestion: {
          heightCm: body.heightCm,
          weightKg: body.weightKg,
          gender: body.gender,
          suggestedSize,
        },
      });

      return res.json({
        reply: aiReply || fallbackReply,
        filters: responseFilters,
        products: responseProducts,
        metrics: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
      });
    }

    if (merged.intent === "sale_products") {
      const saleKeywords = filterKeywordsForSale(merged.keywords);

      const saleFilters = {
        ...merged,
        intent: "sale_products",
        saleOnly: true,
        sortBy: merged.sortBy || "discount",
        sortOrder: merged.sortOrder || "desc",
        keywords: saleKeywords,
      };

      if (
        ["nam", "nu", "unisex"].includes(saleFilters.categorySlug) &&
        !hasSpecificCategoryCue(userMessage)
      ) {
        delete saleFilters.categorySlug;
      }

      if (
        saleFilters.gender === "nu" &&
        typeof saleFilters.categorySlug === "string" &&
        /(^|-)nam($|-)/.test(saleFilters.categorySlug)
      ) {
        delete saleFilters.categorySlug;
      }

      if (
        saleFilters.gender === "nam" &&
        typeof saleFilters.categorySlug === "string" &&
        /(^|-)nu($|-)/.test(saleFilters.categorySlug)
      ) {
        delete saleFilters.categorySlug;
      }

      const result = await queryProducts(saleFilters, {
        page: Math.max(1, Number(page) || 1),
        limit: Math.min(100, Math.max(1, Number(limit) || 12)),
      });

      const responseProducts = attachProductReasons(
        result.products,
        {},
        saleFilters
      );

      const reply = isBestDiscountQuestion(userMessage)
        ? buildBestDiscountReply(result.products)
        : buildSaleReply(result.total, result.products, saleFilters);

      return res.json({
        reply,
        filters: saleFilters,
        products: responseProducts,
        metrics: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
      });
    }

    const searchResult = await queryProductsWithRelaxation(merged, {
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(100, Math.max(1, Number(limit) || 30)),
    });

    const result = searchResult.result;
    const responseFilters = searchResult.filters;
    const responseProducts = attachProductReasons(
      result.products,
      {},
      responseFilters
    );

    let reply;

    if (!result.products.length) {
      reply = "Mình chưa tìm thấy sản phẩm phù hợp. Bạn có thể thử nới khoảng giá, đổi màu, đổi size hoặc hỏi theo danh mục khác nhé.";
    } else if (searchResult.relaxed) {
      reply = `Mình chưa thấy sản phẩm khớp toàn bộ điều kiện, nên đã thử ${searchResult.relaxedMessage}. Mình gợi ý một vài lựa chọn gần phù hợp bên dưới để bạn tham khảo.`;
    } else {
      reply = `Mình tìm được ${result.total} sản phẩm phù hợp với nhu cầu của bạn. Bạn có thể xem các lựa chọn bên dưới, mỗi sản phẩm đều có lý do gợi ý để dễ cân nhắc hơn.`;
    }

    return res.json({
      reply,
      filters: responseFilters,
      products: responseProducts,
      metrics: {
        total: result.total,
        page: result.page,
        limit: result.limit,
      },
      debug: CHAT_DEBUG
        ? {
          lastMessage: userMessage,
          keepPreviousFilters,
          originalFilters: merged,
          responseFilters,
          relaxed: searchResult.relaxed,
          relaxedMessage: searchResult.relaxedMessage,
        }
        : undefined,
    });
  } catch (err) {
    console.error("chatSearch error:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};