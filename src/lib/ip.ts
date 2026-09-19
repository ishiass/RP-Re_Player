import type { AppEnv } from "./cloudflare";

type CfRequest = Request & { cf?: { country?: string } };
type NameMap = Record<string, string>;

export interface IpDetails {
  source: "pconline" | "ip.nc.gy" | "country";
  countryCode: string;
  countryNames: NameMap;
  cityNames: NameMap;
  subdivisionNames: NameMap;
  province?: string;
  city?: string;
  operator?: string;
  asn?: number;
  asOrganization?: string;
  asDomain?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  timeZone?: string;
  proxy?: Record<string, boolean>;
}

export function clientIp(request: Request) {
  const value = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "").trim();
  if (!value || value.length > 64 || !/^[0-9a-f:.]+$/i.test(value)) return "";
  if (
    value === "::1" ||
    value.startsWith("127.") ||
    value.startsWith("10.") ||
    value.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value) ||
    /^(fc|fd|fe8|fe9|fea|feb)/i.test(value)
  ) {
    return "";
  }
  return value;
}

export function countryFallback(request: Request) {
  return String((request as CfRequest).cf?.country || "").toUpperCase().slice(0, 8);
}

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));
  return { controller, timer };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function selectedNames(value: unknown): NameMap {
  if (!value || typeof value !== "object") return {};
  const names = value as Record<string, unknown>;
  const selected: NameMap = {};
  const aliases: Array<[string, string[]]> = [
    ["zh", ["zh-CN", "zh", "zh-TW"]],
    ["ja", ["ja"]],
    ["en", ["en"]]
  ];
  for (const [target, keys] of aliases) {
    const found = keys.map((key) => stringValue(names[key])).find(Boolean);
    if (found) selected[target] = found;
  }
  return selected;
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function countryName(countryCode: string) {
  const names: NameMap = {};
  if (countryCode === "CN") names.zh = "中国";
  if (countryCode === "JP") names.ja = "日本";
  if (countryCode === "US") {
    names.zh = "美国";
    names.en = "United States";
  }
  return names;
}

export function countryOnlyDetails(countryCode: string): IpDetails {
  const code = countryCode.toUpperCase().slice(0, 8);
  return {
    source: "country",
    countryCode: code,
    countryNames: countryName(code),
    cityNames: {},
    subdivisionNames: {}
  };
}

export async function lookupInitialCountry(request: Request, ip: string, timeoutMs = 1800) {
  const fallback = countryFallback(request);
  if (!ip) return fallback;
  const { controller, timer } = withTimeout(timeoutMs);
  try {
    const response = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) return fallback;
    const data = (await response.json()) as { country?: string };
    return stringValue(data.country).toUpperCase().slice(0, 8) || fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

function pconlineOperator(address: string) {
  const carrier = address.match(/(?:中国)?(?:电信|联通|移动|广电|铁通|教育网|鹏博士)|(?:腾讯|阿里)(?:云)?|Tencent(?: Cloud)?|Alibaba(?: Cloud)?|Aliyun/i)?.[0];
  if (carrier) return carrier;
  return "";
}

function compactChinaName(value: string) {
  return value.replace(/(?:特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|省|市)$/u, "");
}

async function lookupChina(ip: string, timeoutMs: number) {
  const { controller, timer } = withTimeout(timeoutMs);
  try {
    const response = await fetch(`https://whois.pconline.com.cn/ipJson.jsp?ip=${encodeURIComponent(ip)}&json=true`, {
      headers: { accept: "application/json, text/plain, */*" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    let data: Record<string, unknown> | null = null;
    let fallback: Record<string, unknown> | null = null;
    for (const encoding of ["utf-8", "gb18030"]) {
      try {
        const text = new TextDecoder(encoding).decode(bytes).replace(/^\uFEFF/, "");
        const parsed = JSON.parse(text) as Record<string, unknown>;
        if (!fallback) fallback = parsed;
        if (!text.includes("\uFFFD")) {
          data = parsed;
          break;
        }
      } catch {
        // Try the next supported encoding.
      }
    }
    if (!data) data = fallback;
    if (!data) return null;
    const countryCode = "CN";
    const province = stringValue(data.pro);
    const city = stringValue(data.city);
    const address = stringValue(data.addr);
    const operator = pconlineOperator(address);
    return {
      source: "pconline",
      countryCode,
      countryNames: { zh: "中国" },
      cityNames: city ? { zh: compactChinaName(city) } : {} as NameMap,
      subdivisionNames: province ? { zh: compactChinaName(province) } : {} as NameMap,
      province: province || undefined,
      city: city || undefined,
      operator: operator || undefined
    } satisfies IpDetails;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookupWorld(ip: string, timeoutMs: number) {
  const { controller, timer } = withTimeout(timeoutMs);
  try {
    const response = await fetch(`https://ip.nc.gy/json?ip=${encodeURIComponent(ip)}`, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, any>;
    const country = data.country && typeof data.country === "object" ? data.country : {};
    const city = data.city && typeof data.city === "object" ? data.city : {};
    const subdivisions = Array.isArray(data.subdivisions) ? data.subdivisions : [];
    const subdivision = subdivisions[0] && typeof subdivisions[0] === "object" ? subdivisions[0] : {};
    const location = data.location && typeof data.location === "object" ? data.location : {};
    const postal = data.postal && typeof data.postal === "object" ? data.postal : {};
    const asn = data.asn && typeof data.asn === "object" ? data.asn : {};
    const proxy = data.proxy && typeof data.proxy === "object" ? data.proxy as Record<string, unknown> : {};
    const proxyFlags: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(proxy)) {
      if (typeof value === "boolean") proxyFlags[key] = value;
    }
    const countryCode = stringValue(country.iso_code).toUpperCase().slice(0, 8);
    const organization = stringValue(asn.autonomous_system_organization);
    return {
      source: "ip.nc.gy",
      countryCode,
      countryNames: selectedNames(country.names),
      cityNames: selectedNames(city.names),
      subdivisionNames: selectedNames(subdivision.names),
      operator: organization || undefined,
      asn: finiteNumber(asn.autonomous_system_number),
      asOrganization: organization || undefined,
      asDomain: stringValue(asn.as_domain) || undefined,
      postalCode: stringValue(postal.code) || undefined,
      latitude: finiteNumber(location.latitude),
      longitude: finiteNumber(location.longitude),
      timeZone: stringValue(location.time_zone) || undefined,
      proxy: proxyFlags
    } satisfies IpDetails;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupIpDetails(ip: string, countryCode: string, timeoutMs = 9000) {
  if (!ip) return null;
  return countryCode === "CN" ? lookupChina(ip, timeoutMs) : lookupWorld(ip, timeoutMs);
}

function namesForDisplay(names: NameMap) {
  return uniqueValues([names.zh, names.ja, names.en].filter((value): value is string => Boolean(value)));
}

function dateCode(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "00_00_00";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}_${values.month}_${values.day}`;
}

export function formatRegion(details: IpDetails, createdAt: string) {
  const place = details.source === "pconline"
    ? namesForDisplay(details.cityNames)
    : namesForDisplay(details.subdivisionNames).length
      ? namesForDisplay(details.subdivisionNames)
      : namesForDisplay(details.cityNames);
  const country = namesForDisplay(details.countryNames);
  const placeText = place.join(" / ");
  const countryText = country.join(" / ") || details.countryCode || "-";
  const operator = details.operator ? ` ${details.operator}` : "";
  return `${placeText ? `${placeText}-` : ""}${countryText}${operator} ${details.countryCode || "--"}:${dateCode(createdAt)}`;
}

export function isCarrierRedirectOperator(operator: string) {
  return /腾讯|tencent|阿里|alibaba|aliyun/i.test(operator);
}

export async function routeForChinaCloudIp(request: Request, env: AppEnv) {
  if (!env.T || !/^(?:0|false|off|no|disabled)$/i.test(env.T.trim())) {
    const ip = clientIp(request);
    if (!ip) return "";
    const deadline = Date.now() + 9000;
    const country = await lookupInitialCountry(request, ip, Math.max(250, deadline - Date.now()));
    if (country !== "CN") return "";
    const details = await lookupIpDetails(ip, country, Math.max(250, deadline - Date.now()));
    const operator = details?.operator || "";
    if (details?.source === "pconline" && isCarrierRedirectOperator(operator) && /腾讯|tencent/i.test(operator)) return "https://cloud.tencent.com/";
    if (details?.source === "pconline" && isCarrierRedirectOperator(operator) && /阿里|alibaba|aliyun/i.test(operator)) return "https://www.aliyun.com/";
  }
  return "";
}
