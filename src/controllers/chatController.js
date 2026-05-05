const Product = require("../models/Product");
const Category = require("../models/Category");
const ProductVariant = require("../models/ProductVariant");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = process.env.GOOGLE_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
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
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
  "không", "khong", "đang", "dang", "nào", "nao"
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
    slugCandidates: ["quan-dai", "quan-dai-nam", "quan-tay"],
    aliases: ["quan dai", "quan tay", "quan kaki", "quan jean", "jean"],
  },
  {
    slugCandidates: ["do-the-thao", "the-thao"],
    aliases: ["do the thao", "the thao", "sport", "gym", "chay bo"],
  },
  {
    slugCandidates: ["phu-kien", "phu-kien-nam"],
    aliases: ["phu kien", "that lung", "vo", "tat", "mu", "non"],
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

  // Tránh lỗi "đỏ" bị normalize thành "do" rồi match nhầm với "đồ".
  if (aliasNorm.length < 3) {
    if (aliasLower === aliasNorm) return false;
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
  const matches = textLower.match(/\b(3xl|2xl|xxl|xl|xs|s|m|l)\b/gi);
  if (!matches) return null;
  const normalized = [...new Set(matches.map((m) => normalizeSizeToken(m)))];
  return normalized.length === 1 ? normalized[0] : normalized;
}

function extractPrices(textLower) {
  const unitFactor = (n, u) => {
    let num = Number(n.replace(/[.,]/g, ""));
    if (isNaN(num)) return null;

    if (!u) {
      if (num < 1000) return num * 1000;
      return num;
    }

    u = u.trim();
    if (["k", "ngàn", "nghìn", "k."].includes(u)) return num * 1000;
    if (["tr", "triệu"].includes(u)) return num * 1_000_000;
    if (["trăm"].includes(u)) return num * 100;
    return num;
  };

  let minPrice = null;
  let maxPrice = null;

  const rangeR =
    /(\d+(?:[.,]\d+)?)(\s?(k|ngàn|nghìn|tr|triệu|trăm)?)\s*(?:-|đến|to|>|<|>=|<=|~)\s*(\d+(?:[.,]\d+)?)(\s?(k|ngàn|nghìn|tr|triệu|trăm)?)/;
  const singleR =
    /(dưới|trên|từ|>=|<=|>|<|~)?\s*(\d+(?:[.,]\d+)?)(\s?(k|ngàn|nghìn|tr|triệu|trăm)?)/;

  const rangeM = textLower.match(rangeR);
  if (rangeM) {
    const v1 = unitFactor(rangeM[1], rangeM[3]);
    const v2 = unitFactor(rangeM[4], rangeM[6]);
    if (v1 && v2) {
      minPrice = Math.min(v1, v2);
      maxPrice = Math.max(v1, v2);
      return { minPrice, maxPrice };
    }
  }

  const sM = textLower.match(singleR);
  if (sM) {
    const dir = sM[1];
    const val = unitFactor(sM[2], sM[4]);
    if (val) {
      if (!dir || dir === "~") {
        minPrice = Math.round(val);
        maxPrice = Math.round(val * 1.3);
      } else if (["dưới", "<", "<="].includes(dir)) {
        maxPrice = val;
      } else if (["trên", "từ", ">", ">="].includes(dir)) {
        minPrice = val;
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

  if (/\b(nu|nữ|con gai|phu nu)\b/.test(text)) gender = "female";
  else if (/\b(nam|con trai|dan ong)\b/.test(text)) gender = "male";

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
    if (heightCm <= 155 && weightKg <= 45) return "S";
    if (heightCm <= 162 && weightKg <= 52) return "M";
    if (heightCm <= 168 && weightKg <= 60) return "L";
    if (heightCm <= 173 && weightKg <= 68) return "XL";
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

function buildSaleReply(total, sampleProducts) {
  if (!total) {
    return "Hiện mình chưa thấy sản phẩm sale phù hợp. Bạn thử đổi danh mục hoặc hỏi cụ thể hơn nhé.";
  }

  const sample = sampleProducts.slice(0, 5).map((p) => p.name).join(", ");
  return `Mình tìm thấy ${total} sản phẩm đang sale. Ví dụ: ${sample}. Muốn lọc thêm theo giá, màu hoặc size không?`;
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
    /\b(1[0-9]|2[0-9]|3[0-9])\s*tuoi\b/.test(text) ||
    text.includes("sinh vien") ||
    text.includes("hoc sinh") ||
    text.includes("di hoc") ||
    text.includes("du tiec") ||
    text.includes("sinh nhat") ||
    text.includes("di lam") ||
    text.includes("di choi");

  return hasOutfitSignal || hasContextSignal;
}

function inferIntentHeuristic(userMessage, parsedIntent = null) {
  const text = normalizeText(userMessage);

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

  if (isOutfitAdviceQuestion(userMessage)) {
    return "outfit_advice";
  }

  if ([...SALE_TERMS].some((term) => text.includes(normalizeText(term)))) {
    return "sale_products";
  }

  if (parsedIntent === "greeting") return "greeting";
  if (parsedIntent === "outfit_advice") return "outfit_advice";

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

        return (
          slugNorm.includes(candidateNorm) ||
          candidateNorm.includes(slugNorm) ||
          nameNorm.includes(candidateNorm) ||
          group.aliases.some((alias) => nameNorm.includes(normalizePhrase(alias)))
        );
      });
    });

    if (found?.slug) {
      return found.slug;
    }
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
 "intent":"search_products"|"size_advice"|"sale_products"|"outfit_advice"|"greeting"|"other",
 "keywords": string[]|null,
 "categorySlug": string|null,
 "brand": string|null,
 "color": string|null,
 "size": string|null,
 "minPrice": number|null,
 "maxPrice": number|null,
 "sortBy":"price"|"relevance"|"discount"|null,
 "sortOrder":"asc"|"desc"|null
}
Chuyển k/ngàn/nghìn = *1000, triệu/tr = *1_000_000.
Không đưa các từ chỉ giá như "dưới", "trên", "khoảng", "400k" vào keywords nếu đã hiểu thành min/max price.
Nếu người dùng đang hỏi tư vấn size, đặt intent là "size_advice".
Nếu người dùng hỏi sản phẩm sale / giảm giá, đặt intent là "sale_products".
Nếu người dùng hỏi mặc gì, phối đồ, outfit, đi học, đi chơi, đi làm, dự tiệc, sinh nhật, quà tặng hoặc cần tư vấn theo hoàn cảnh, đặt intent là "outfit_advice".
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

async function fallbackParse(userMessage) {
  const lower = userMessage.toLowerCase();
  const color = normalizeColor(lower);
  const { minPrice, maxPrice } = extractPrices(lower);
  const size = extractSizes(lower);
  const { categorySlug, brand } = await semanticCategoryBrand(lower);

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
  } = filters;

  const { page = 1, limit = 30 } = pagination;
  const productFilter = { status: "active" };

  function emptyResult() {
    return { total: 0, page, limit, products: [] };
  }

  if (categorySlug) {
    const cat = await Category.findOne({ slug: categorySlug }).lean();
    if (cat) productFilter.categoryId = cat._id;
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
  if (parsed.categorySlug) return parsed;

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
  if (!previousFilters) return false;

  const text = normalizeText(userMessage || "");

  // Nếu câu mới đã có anchor sản phẩm rõ ràng thì coi là truy vấn mới.
  if (hasCurrentProductAnchor(parsed)) return false;

  // Một số câu nhìn như truy vấn mới, không nên giữ filter cũ.
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

  // Câu hỏi sale tổng quát cũng nên reset, không nên kẹt context cũ.
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

  const ageMatch = text.match(/\b(1[0-9]|2[0-9]|3[0-9]|4[0-9])\s*tuoi\b/);
  if (ageMatch) age = Number(ageMatch[1]);

  if (text.includes("sinh vien")) customerType = "sinh viên";
  else if (text.includes("hoc sinh")) customerType = "học sinh";
  else if (text.includes("di lam") || text.includes("cong so")) {
    customerType = "đi làm";
  }

  if (text.includes("sinh nhat")) occasion = "dự tiệc sinh nhật";
  else if (text.includes("du tiec")) occasion = "dự tiệc";
  else if (text.includes("di hoc")) occasion = "đi học";
  else if (text.includes("di lam")) occasion = "đi làm";
  else if (text.includes("di choi") || text.includes("cuoi tuan")) {
    occasion = "đi chơi";
  } else if (text.includes("qua tang")) occasion = "quà tặng";

  return {
    occasion,
    customerType,
    age,
  };
}

function getOutfitSearchPlans(message) {
  const text = normalizeText(message || "");

  if (
    text.includes("ao so mi") ||
    text.includes("so mi") ||
    text.includes("somi") ||
    text.includes("shirt")
  ) {
    return [
      {
        label: "áo sơ mi tương tự",
        filters: {
          intent: "search_products",
          categorySlug: "ao-so-mi-nam",
          keywords: ["sơ mi"],
        },
      },
      {
        label: "áo polo dễ phối cùng",
        filters: {
          intent: "search_products",
          categorySlug: "ao-polo-nam",
          keywords: ["polo"],
        },
      },
    ];
  }

  if (text.includes("ao polo") || text.includes("polo")) {
    return [
      {
        label: "áo polo tương tự",
        filters: {
          intent: "search_products",
          categorySlug: "ao-polo-nam",
          keywords: ["polo"],
        },
      },
      {
        label: "áo sơ mi lịch sự",
        filters: {
          intent: "search_products",
          categorySlug: "ao-so-mi-nam",
          keywords: ["sơ mi"],
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
          categorySlug: "ao-thun-nam",
          keywords: ["thun"],
        },
      },
      {
        label: "áo polo dễ phối",
        filters: {
          intent: "search_products",
          categorySlug: "ao-polo-nam",
          keywords: ["polo"],
        },
      },
    ];
  }

  if (text.includes("quan short") || text.includes("short")) {
    return [
      {
        label: "quần short tương tự",
        filters: {
          intent: "search_products",
          categorySlug: "quan-short",
          keywords: ["short"],
        },
      },
      {
        label: "đồ thể thao dễ phối",
        filters: {
          intent: "search_products",
          categorySlug: "do-the-thao",
          keywords: ["thể thao"],
        },
      },
    ];
  }

  if (text.includes("sinh nhat") || text.includes("du tiec")) {
    return [
      {
        label: "áo sơ mi lịch sự",
        filters: {
          intent: "search_products",
          categorySlug: "ao-so-mi-nam",
          keywords: ["sơ mi"],
        },
      },
      {
        label: "áo polo tối giản",
        filters: {
          intent: "search_products",
          categorySlug: "ao-polo-nam",
          keywords: ["polo"],
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
          categorySlug: "ao-polo-nam",
          keywords: ["polo"],
        },
      },
      {
        label: "áo thun basic",
        filters: {
          intent: "search_products",
          categorySlug: "ao-thun-nam",
          keywords: ["thun"],
        },
      },
    ];
  }

  if (text.includes("the thao") || text.includes("gym") || text.includes("chay bo")) {
    return [
      {
        label: "đồ thể thao",
        filters: {
          intent: "search_products",
          categorySlug: "do-the-thao",
          keywords: ["thể thao"],
        },
      },
    ];
  }

  if (text.includes("qua tang")) {
    return [
      {
        label: "áo polo dễ tặng",
        filters: {
          intent: "search_products",
          categorySlug: "ao-polo-nam",
          keywords: ["polo"],
        },
      },
      {
        label: "áo sơ mi dễ mặc",
        filters: {
          intent: "search_products",
          categorySlug: "ao-so-mi-nam",
          keywords: ["sơ mi"],
        },
      },
    ];
  }

  return [
    {
      label: "áo polo dễ mặc",
      filters: {
        intent: "search_products",
        categorySlug: "ao-polo-nam",
        keywords: ["polo"],
      },
    },
    {
      label: "áo sơ mi lịch sự",
      filters: {
        intent: "search_products",
        categorySlug: "ao-so-mi-nam",
        keywords: ["sơ mi"],
      },
    },
  ];
}

async function queryOutfitAdviceProducts(userMessage, pagination) {
  const plans = getOutfitSearchPlans(userMessage);
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

function buildOutfitAdviceReply(userMessage, styleContext, products) {
  const text = normalizeText(userMessage || "");
  const occasion = styleContext.occasion || "nhu cầu của bạn";

  const isProductDetailAdvice =
    text.includes("san pham tuong tu") ||
    text.includes("tuong tu") ||
    text.includes("phoi cung") ||
    text.includes("de phoi cung") ||
    text.includes("dang xem");

  let reply = "";

  if (isProductDetailAdvice) {
    reply =
      "Với sản phẩm bạn đang xem, mình gợi ý ưu tiên cách phối gọn gàng, dễ mặc và giữ màu sắc hài hòa. Nếu là áo sơ mi, bạn có thể phối với quần tối màu hoặc quần kaki để trông lịch sự hơn; nếu muốn trẻ trung hơn có thể chọn các mẫu polo hoặc áo basic dễ phối cùng. ";
  } else {
    const profileParts = [];
    if (styleContext.customerType) profileParts.push(`là ${styleContext.customerType}`);
    if (styleContext.age) profileParts.push(`${styleContext.age} tuổi`);

    reply = profileParts.length
      ? `Với thông tin bạn ${profileParts.join(", ")} và đang cần đồ cho ${occasion}, mình gợi ý bạn ưu tiên phong cách gọn gàng, dễ mặc và không quá cầu kỳ. `
      : `Với nhu cầu tìm đồ cho ${occasion}, mình gợi ý bạn ưu tiên phong cách gọn gàng, dễ mặc và không quá cầu kỳ. `;

    if (occasion.includes("sinh nhật") || occasion.includes("dự tiệc")) {
      reply += "Bạn có thể chọn áo sơ mi form vừa nếu muốn lịch sự hơn, hoặc áo polo tối giản nếu muốn trẻ trung và thoải mái. Các màu dễ dùng là trắng, đen, xanh navy, xám hoặc be. ";
    } else if (occasion.includes("đi học")) {
      reply += "Bạn nên chọn áo polo, áo thun basic hoặc sơ mi đơn giản, ưu tiên chất liệu thoáng và màu trung tính để dễ phối nhiều ngày. ";
    } else if (occasion.includes("quà tặng")) {
      reply += "Nếu mua làm quà, nên chọn các mẫu dễ mặc như polo hoặc sơ mi basic, màu trung tính và size phổ biến. ";
    } else {
      reply += "Mình sẽ ưu tiên các mẫu dễ phối, dùng được trong nhiều hoàn cảnh và có màu sắc an toàn. ";
    }
  }

  if (products.length) {
    const sample = products.slice(0, 3).map((p) => p.name).join(", ");
    reply += `Mình gợi ý một vài sản phẩm phù hợp như: ${sample}.`;
  } else {
    reply += "Hiện mình chưa tìm được sản phẩm thật sự phù hợp trong dữ liệu, bạn có thể nói rõ hơn về màu, ngân sách hoặc kiểu mặc bạn thích.";
  }

  return reply;
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

    let parsed = await callGeminiForFilters(userMessage);
    if (!parsed) parsed = await fallbackParse(userMessage);

    const lower = userMessage.toLowerCase();
    const { categorySlug, brand } = await semanticCategoryBrand(lower);

    if (!parsed.categorySlug && categorySlug) parsed.categorySlug = categorySlug;
    if (!parsed.brand && brand) parsed.brand = brand;

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

    await inferCategoryFromKeywords(merged, userMessage);

    if (CHAT_DEBUG) {
      console.log("[CHAT_DEBUG] merged filters =>", merged);
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
      const styleContext = extractStyleContext(userMessage);

      const outfitResult = await queryOutfitAdviceProducts(userMessage, {
        page: Math.max(1, Number(page) || 1),
        limit: Math.min(100, Math.max(1, Number(limit) || 6)),
      });

      return res.json({
        reply: buildOutfitAdviceReply(userMessage, styleContext, outfitResult.products),
        filters: {
          ...merged,
          intent: "outfit_advice",
          styleContext,
        },
        products: outfitResult.products,
        metrics: {
          total: outfitResult.total,
          page: outfitResult.page,
          limit: outfitResult.limit,
        },
      });
    }

    if (merged.intent === "size_advice") {
      const body = extractBodyInfo(userMessage);

      if (!body.heightCm || !body.weightKg) {
        return res.json({
          reply: buildSizeAdviceReply(body, null, 0),
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

      const result = await queryProducts(sizeFilters, {
        page: Math.max(1, Number(page) || 1),
        limit: Math.min(100, Math.max(1, Number(limit) || 6)),
      });

      return res.json({
        reply: buildSizeAdviceReply(body, suggestedSize, result.total),
        filters: {
          ...sizeFilters,
          sizeSuggestion: suggestedSize,
        },
        products: result.products,
        metrics: {
          total: result.total,
          page: result.page,
          limit: result.limit,
        },
      });
    }

    if (merged.intent === "sale_products") {
      const saleKeywords = filterKeywordsForSale(merged.keywords);

      const hasSpecificSaleTarget = Boolean(
        merged.categorySlug ||
        merged.brand ||
        merged.color ||
        merged.size ||
        (saleKeywords && saleKeywords.length)
      );

      const broadSaleQuery = isBroadSaleQuery(userMessage) && !hasSpecificSaleTarget;

      const saleFilters = {
        ...merged,
        saleOnly: true,
        sortBy: merged.sortBy || "discount",
        sortOrder: merged.sortOrder || "desc",
        keywords: broadSaleQuery ? null : saleKeywords,
      };

      if (broadSaleQuery) {
        delete saleFilters.categorySlug;
        delete saleFilters.brand;
        delete saleFilters.color;
        delete saleFilters.size;
      }

      let result = await queryProducts(saleFilters, {
        page: Math.max(1, Number(page) || 1),
        limit: Math.min(100, Math.max(1, Number(limit) || 12)),
      });

      // Nếu vẫn không có kết quả do keyword/filter bị hiểu sai, thử lại bằng sale rộng.
      if (!result.total) {
        const fallbackSaleFilters = {
          intent: "sale_products",
          saleOnly: true,
          sortBy: "discount",
          sortOrder: "desc",
          keywords: null,
        };

        result = await queryProducts(fallbackSaleFilters, {
          page: Math.max(1, Number(page) || 1),
          limit: Math.min(100, Math.max(1, Number(limit) || 12)),
        });

        const reply = result.total
          ? buildSaleReply(result.total, result.products)
          : buildSaleReply(0, []);

        return res.json({
          reply,
          filters: fallbackSaleFilters,
          products: result.products,
          metrics: {
            total: result.total,
            page: result.page,
            limit: result.limit,
          },
        });
      }

      const reply = isBestDiscountQuestion(userMessage)
        ? buildBestDiscountReply(result.products)
        : buildSaleReply(result.total, result.products);

      return res.json({
        reply,
        filters: saleFilters,
        products: result.products,
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

    let reply;

    if (!result.products.length) {
      reply = "Mình chưa tìm thấy sản phẩm phù hợp. Bạn có thể thử hỏi theo loại sản phẩm, màu, size hoặc khoảng giá khác nhé.";
    } else {
      const sample = result.products.slice(0, 5).map((p) => p.name).join(", ");

      if (searchResult.relaxed) {
        reply = `Mình chưa thấy sản phẩm đúng toàn bộ điều kiện, nên đã thử ${searchResult.relaxedMessage}. Mình tìm được ${result.total} sản phẩm gần phù hợp. Ví dụ: ${sample}.`;
      } else {
        reply = `Có ${result.total} sản phẩm phù hợp. Ví dụ: ${sample}. Bạn muốn lọc thêm theo màu, size hay khoảng giá không?`;
      }
    }

    return res.json({
      reply,
      filters: responseFilters,
      products: result.products,
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