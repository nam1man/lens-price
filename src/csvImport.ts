export type CsvRow = {
  brand: string;
  lensType: string;
  productName: string;
  wearType: string;
  packQuantity: string;
  displayPrice: number | null;
  oldPrice: number | null;
  unitPrice: number | null;
};

export type ParseResult = {
  rows: CsvRow[];
  skippedHeader: boolean;
  totalLines: number;
};

const HEADER_ALIASES: Record<string, keyof CsvRow> = {
  브랜드: 'brand',
  brand: 'brand',
  렌즈구분: 'lensType',
  'lens type': 'lensType',
  '렌즈 구분': 'lensType',
  제품명: 'productName',
  'product name': 'productName',
  '제품 명': 'productName',
  착용유형: 'wearType',
  'wear type': 'wearType',
  '착용 유형': 'wearType',
  포장수량: 'packQuantity',
  'pack quantity': 'packQuantity',
  '포장 수량': 'packQuantity',
  권장가격: 'displayPrice',
  표시가격: 'displayPrice',
  'display price': 'displayPrice',
  '권장 가격': 'displayPrice',
  '표시 가격': 'displayPrice',
  '권장/표시가격(원)': 'displayPrice',
  '권장/표시가격': 'displayPrice',
  이전가격: 'oldPrice',
  'old price': 'oldPrice',
  '이전 가격': 'oldPrice',
  '이전 가격(원)': 'oldPrice',
  '1개당가격': 'unitPrice',
  'unit price': 'unitPrice',
  '1개당 가격': 'unitPrice',
  '1개당 가격(원)': 'unitPrice',
  price: 'displayPrice',
};

function parsePrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return null;
  const cleaned = trimmed.replace(/,/g, '').replace(/원/g, '').trim();
  if (cleaned === '') return null;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

export function parseCsv(text: string): ParseResult {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    return { rows: [], skippedHeader: false, totalLines: 0 };
  }

  const firstFields = splitCsvLine(lines[0]).map((f) => f.trim().toLowerCase());
  const headerMap: (keyof CsvRow | null)[] = firstFields.map(
    (f) => HEADER_ALIASES[f] ?? null
  );

  const skippedHeader = headerMap.some((h) => h !== null);
  const dataStart = skippedHeader ? 1 : 0;

  const defaultOrder: (keyof CsvRow)[] = [
    'brand',
    'lensType',
    'productName',
    'wearType',
    'packQuantity',
    'displayPrice',
    'oldPrice',
    'unitPrice',
  ];

  const rows: CsvRow[] = [];

  for (let i = dataStart; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i]);
    const row = {
      brand: '',
      lensType: '',
      productName: '',
      wearType: '',
      packQuantity: '',
      displayPrice: null as number | null,
      oldPrice: null as number | null,
      unitPrice: null as number | null,
    };

    for (let col = 0; col < fields.length; col++) {
      const key = skippedHeader
        ? headerMap[col]
        : defaultOrder[col] ?? null;

      if (!key) continue;

      if (
        key === 'displayPrice' ||
        key === 'oldPrice' ||
        key === 'unitPrice'
      ) {
        row[key] = parsePrice(fields[col]);
      } else {
        row[key] = fields[col].trim();
      }
    }

    if (row.brand.trim() || row.productName.trim()) {
      rows.push(row);
    }
  }

  return { rows, skippedHeader, totalLines: lines.length };
}

export type DuplicateInfo = {
  row: CsvRow;
  index: number;
  existingId: string;
  existingProductName: string;
};

export function findDuplicates(
  rows: CsvRow[],
  existing: { id: string; brand: string; productName: string; packQuantity: string }[]
): DuplicateInfo[] {
  const duplicates: DuplicateInfo[] = [];
  const existingMap = new Map<string, { id: string; productName: string }>();
  for (const item of existing) {
    const key = `${item.brand.trim()}|${item.productName.trim()}|${item.packQuantity.trim()}`.toLowerCase();
    existingMap.set(key, { id: item.id, productName: item.productName });
  }

  rows.forEach((row, index) => {
    const key = `${row.brand.trim()}|${row.productName.trim()}|${row.packQuantity.trim()}`.toLowerCase();
    const found = existingMap.get(key);
    if (found) {
      duplicates.push({
        row,
        index,
        existingId: found.id,
        existingProductName: found.productName,
      });
    }
  });

  return duplicates;
}
