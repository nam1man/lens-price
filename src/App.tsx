import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { db, auth } from './firebase';
import {
  parseCsv,
  findDuplicates,
  type CsvRow,
  type DuplicateInfo,
} from './csvImport';
import './App.css';

type Lens = {
  id: string;
  brand: string;
  productName: string;
  specification: string;
  lensType: string;
  wearType: string;
  packQuantity: string;
  displayPrice: number | null;
  oldPrice: number | null;
  unitPrice: number | null;
  price: number;
};



type SpectacleLens = {
  manufacturer: string;
  family: string;
  name: string;
  index: string;
  price: number | null;
  verification: string;
};


type LensOption = { manufacturer:string; name:string; index:string; coatings:{id:string;label:string;price:number}[]; extras:{id:string;label:string;add:number}[] };
function LensVariant({variant,option}:{variant:SpectacleLens;option?:LensOption}) {
  const [expanded,setExpanded]=useState(false);
  const [coating,setCoating]=useState('base');
  const [extras,setExtras]=useState<string[]>([]);
  const coatingItem=option?.coatings.find(c=>c.id===coating) ?? option?.coatings[0];
  const chosenExtras=(option?.extras ?? []).filter(x=>extras.includes(x.id));
  const total=(coatingItem?.price ?? variant.price ?? 0)+chosenExtras.reduce((n,x)=>n+x.add,0);
  return <div className="nikon-variant-wrap">
    <button type="button" className="spectacle-variant nikon-variant-button" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>
      <span>{variant.index} <small className="nikon-option-hint">{expanded?'접기':'코팅·변색 선택 ▾'}</small></span>
      <strong>{priceText(variant.price)}</strong>
    </button>
    {expanded && <div className="nikon-option-panel">
      {option ? <>
        <div className="nikon-option-label">코팅·가격 선택</div>
        <div className="nikon-option-choices">{option.coatings.map(c=><label key={c.id} className={'nikon-option-choice '+(coating===c.id?'selected':'')}><input type="radio" name={'coat-'+variant.manufacturer+'-'+variant.name+'-'+variant.index} checked={coating===c.id} onChange={()=>setCoating(c.id)}/><span>{c.label}</span><b>{priceText(c.price)}</b></label>)}</div>
        
        {option.extras.filter(x=>/변색/.test(x.label)).length>0 && <><div className="nikon-option-label">변색 옵션</div><div className="nikon-option-choices">{option.extras.filter(x=>/변색/.test(x.label)).map(x=><label key={x.id} className="nikon-option-choice"><input type="checkbox" checked={extras.includes(x.id)} onChange={e=>setExtras(a=>e.target.checked?(x.id==='gens'||x.id==='xtractive'?[...a.filter(y=>y!=='gens'&&y!=='xtractive'),x.id]:[...a,x.id]):a.filter(y=>y!==x.id))}/><span>{x.label}</span><b>+{priceText(x.add)}</b></label>)}</div></>}
        {option.extras.filter(x=>!/변색/.test(x.label)).length>0 && <><div className="nikon-option-label">추가 옵션</div><div className="nikon-option-choices">{option.extras.filter(x=>!/변색/.test(x.label)).map(x=><label key={x.id} className="nikon-option-choice"><input type="checkbox" checked={extras.includes(x.id)} onChange={e=>setExtras(a=>e.target.checked?[...a,x.id]:a.filter(y=>y!==x.id))}/><span>{x.label}</span><b>+{priceText(x.add)}</b></label>)}</div></>}
        <div className="nikon-option-total"><span>선택 옵션 포함 가격</span><strong>{coatingItem?.price == null && variant.price == null ? '가격 확인 필요' : priceText(total)}</strong></div>
        <p className="nikon-option-warning">검토용 데이터입니다. 코팅·변색·착색·프리즘 조합 가능 여부와 추가금은 제조사 원본 가격표를 확인하세요. 확인되지 않은 옵션은 표시하지 않았습니다.</p>
      </> : <p className="nikon-option-warning">옵션 가격 자료가 아직 확인되지 않았습니다. 기본 가격만 확인할 수 있습니다.</p>}
    </div>}
  </div>;
}

const lensCollection = collection(db, 'products', 'name', 'Lens');

function priceText(val: number | null): string {
  if (val === null || val === undefined) return '미입력';
  return `${val.toLocaleString('ko-KR')}원`;
}

function priceToFirestore(val: string): number | null {
  if (val.trim() === '') return null;
  const num = Number(val.replace(/,/g, ''));
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function firestoreToPrice(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

export default function App() {
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [lensTab, setLensTab] = useState<'contact' | 'spectacle'>('contact');
  const [spectacleLenses, setSpectacleLenses] = useState<SpectacleLens[]>([]);
  const [spectacleSearch, setSpectacleSearch] = useState('');
  const [spectacleError, setSpectacleError] = useState('');
  const [lensOptions, setLensOptions] = useState<LensOption[]>([]);
  const [optionLoadError, setOptionLoadError] = useState('');
  const [optionLoaded, setOptionLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('전체');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [brand, setBrand] = useState('');
  const [productName, setProductName] = useState('');
  const [specification, setSpecification] = useState('');
  const [lensType, setLensType] = useState('');
  const [wearType, setWearType] = useState('');
  const [packQuantity, setPackQuantity] = useState('');
  const [displayPrice, setDisplayPrice] = useState('');
  const [oldPrice, setOldPrice] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [status, setStatus] = useState('Firebase 연결 확인 중...');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // CSV upload state
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvDuplicates, setCsvDuplicates] = useState<DuplicateInfo[]>([]);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState('');
  const [csvSuccess, setCsvSuccess] = useState('');
  const [replaceMode, setReplaceMode] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, setUser);
    const unsubscribeData = onSnapshot(
      lensCollection,
      (snapshot) => {
        setLenses(
          snapshot.docs.map((item) => {
            const data = item.data();
            return {
              id: item.id,
              brand: String(data.brand ?? ''),
              productName: String(data.productName ?? ''),
              specification: String(data.specification ?? ''),
              lensType: String(data.lensType ?? ''),
              wearType: String(data.wearType ?? ''),
              packQuantity: String(data.packQuantity ?? ''),
              displayPrice: firestoreToPrice(data.displayPrice),
              oldPrice: firestoreToPrice(data.oldPrice),
              unitPrice: firestoreToPrice(data.unitPrice),
              price: Number(data.price ?? 0),
            };
          })
        );
        setStatus('Firebase 연결 성공');
        setError('');
      },
      (err) => {
        setError(err.message);
        setStatus('Firebase 읽기 실패');
      }
    );

    return () => {
      unsubscribeAuth();
      unsubscribeData();
    };
  }, []);

  useEffect(() => {
    fetch('/spectacle_lenses.json')
      .then((response) => {
        if (!response.ok) throw new Error('안경렌즈 데이터 파일을 불러오지 못했습니다.');
        return response.json();
      })
      .then((data: SpectacleLens[]) => setSpectacleLenses(data))
      .catch((err: unknown) => setSpectacleError(err instanceof Error ? err.message : '안경렌즈 데이터 로딩 실패'));
  }, []);

  useEffect(() => {
    fetch('/lens_options.json?v=gloss-options-diagnostic-20261013b', {cache:'no-store'})
      .then(r => { if (!r.ok) throw new Error(`옵션 파일 HTTP ${r.status}`); return r.json(); })
      .then((data: LensOption[]) => {
        if (!Array.isArray(data)) throw new Error('옵션 파일이 배열 형식이 아닙니다.');
        setLensOptions(data);
        setOptionLoaded(true);
        setOptionLoadError('');
      })
      .catch(err => { setLensOptions([]); setOptionLoaded(false); setOptionLoadError(String(err)); });
  }, []);

  const spectacleGroups = useMemo(() => {
    const q = spectacleSearch.trim().toLowerCase();
    const matched = spectacleLenses.filter((lens) =>
      [lens.manufacturer, lens.family, lens.name, lens.index].some((s) => s.toLowerCase().includes(q))
    );
    const groups = new Map<string, Map<string, Map<string, SpectacleLens[]>>>();
    for (const lens of matched) {
      if (!groups.has(lens.manufacturer)) groups.set(lens.manufacturer, new Map());
      const families = groups.get(lens.manufacturer)!;
      if (!families.has(lens.family)) families.set(lens.family, new Map());
      const products = families.get(lens.family)!;
      if (!products.has(lens.name)) products.set(lens.name, []);
      products.get(lens.name)!.push(lens);
    }
    return Array.from(groups, ([manufacturer, families]) => ({
      manufacturer,
      families: Array.from(families, ([family, products]) => ({
        family,
        products: Array.from(products, ([name, variants]) => ({name, variants})),
      })),
    }));
  }, [spectacleLenses, spectacleSearch]);

  function clearMessages() {
    setError('');
    setSuccess('');
    setCsvError('');
    setCsvSuccess('');
  }

  async function login() {
    clearMessages();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setPassword('');
      setAdminOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패');
    }
  }

  function resetForm() {
    setEditingId(null);
    setBrand('');
    setProductName('');
    setSpecification('');
    setLensType('');
    setWearType('');
    setPackQuantity('');
    setDisplayPrice('');
    setOldPrice('');
    setUnitPrice('');
  }

  function editLens(lens: Lens) {
    setEditingId(lens.id);
    setBrand(lens.brand);
    setProductName(lens.productName);
    setSpecification(lens.specification);
    setLensType(lens.lensType);
    setWearType(lens.wearType);
    setPackQuantity(lens.packQuantity);
    setDisplayPrice(lens.displayPrice !== null ? String(lens.displayPrice) : '');
    setOldPrice(lens.oldPrice !== null ? String(lens.oldPrice) : '');
    setUnitPrice(lens.unitPrice !== null ? String(lens.unitPrice) : '');
    setAdminOpen(true);
  }

  async function saveLens() {
    if (!brand.trim() || !productName.trim()) {
      setError('브랜드와 제품명을 입력해 주세요.');
      return;
    }

    const dispVal = priceToFirestore(displayPrice);
    const oldVal = priceToFirestore(oldPrice);
    const unitVal = priceToFirestore(unitPrice);

    // Backward-compatible: price field = displayPrice or unitPrice or 0
    const compatPrice = dispVal ?? unitVal ?? 0;

    const data = {
      brand: brand.trim(),
      productName: productName.trim(),
      specification: specification.trim(),
      lensType: lensType.trim(),
      wearType: wearType.trim(),
      packQuantity: packQuantity.trim(),
      displayPrice: dispVal,
      oldPrice: oldVal,
      unitPrice: unitVal,
      price: compatPrice,
    };

    clearMessages();
    try {
      if (editingId) {
        await updateDoc(doc(lensCollection, editingId), data);
        setSuccess('상품이 수정되었습니다.');
      } else {
        await addDoc(lensCollection, data);
        setSuccess('상품이 추가되었습니다.');
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    }
  }

  async function removeLens(id: string) {
    if (!window.confirm('이 상품을 삭제할까요?')) return;
    clearMessages();
    try {
      await deleteDoc(doc(lensCollection, id));
      setSuccess('상품이 삭제되었습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    }
  }

  // CSV file handling
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    clearMessages();
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? '');
      try {
        const result = parseCsv(text);
        if (result.rows.length === 0) {
          setCsvError('CSV 파일에서 유효한 데이터를 찾을 수 없습니다.');
          setCsvRows([]);
          setCsvDuplicates([]);
          return;
        }
        const dups = findDuplicates(
          result.rows,
          lenses.map((l) => ({
            id: l.id,
            brand: l.brand,
            productName: l.productName,
            packQuantity: l.packQuantity,
          }))
        );
        setCsvRows(result.rows);
        setCsvDuplicates(dups);
        setCsvError('');
      } catch {
        setCsvError('CSV 파일을 읽는 중 오류가 발생했습니다.');
        setCsvRows([]);
        setCsvDuplicates([]);
      }
    };
    reader.onerror = () => {
      setCsvError('파일을 읽을 수 없습니다.');
    };
    reader.readAsText(file, 'UTF-8');
  }

  function clearCsv() {
    setCsvRows([]);
    setCsvFileName('');
    setCsvDuplicates([]);
    setCsvError('');
    setCsvSuccess('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function rowToData(row: CsvRow) {
    const dispVal = row.displayPrice;
    const unitVal = row.unitPrice;
    const compatPrice = dispVal ?? unitVal ?? 0;
    return {
      brand: row.brand.trim(),
      productName: row.productName.trim(),
      specification: row.packQuantity.trim(),
      lensType: row.lensType.trim(),
      wearType: row.wearType.trim(),
      packQuantity: row.packQuantity.trim(),
      displayPrice: dispVal,
      oldPrice: row.oldPrice,
      unitPrice: unitVal,
      price: compatPrice,
    };
  }

  async function uploadCsv() {
    if (csvRows.length === 0) return;
    if (csvDuplicates.length > 0) {
      setCsvError(
        `중복 항목 ${csvDuplicates.length}개가 있습니다. 중복 항목을 CSV에서 삭제하거나 수정한 후 다시 업로드해 주세요.`
      );
      return;
    }

    setCsvUploading(true);
    clearMessages();
    let added = 0;
    let failed = 0;

    try {
      for (const row of csvRows) {
        try {
          await addDoc(lensCollection, rowToData(row));
          added++;
        } catch {
          failed++;
        }
      }

      if (failed === 0) {
        setCsvSuccess(`${added}개 상품이 등록되었습니다.`);
        clearCsv();
      } else {
        setCsvError(`${added}개 등록 성공, ${failed}개 실패.`);
      }
    } catch {
      setCsvError('업로드 중 오류가 발생했습니다.');
    } finally {
      setCsvUploading(false);
    }
  }

  async function loadBundledCsv(): Promise<CsvRow[]> {
    clearMessages();
    setCsvFileName('lens_prices.csv (첨부 파일)');
    try {
      const resp = await fetch('/lens_prices.csv');
      const text = await resp.text();
      const result = parseCsv(text);
      if (result.rows.length === 0) {
        setCsvError('CSV 파일에서 유효한 데이터를 찾을 수 없습니다.');
        setCsvRows([]);
        setCsvDuplicates([]);
        return [];
      }
      const dups = findDuplicates(
        result.rows,
        lenses.map((l) => ({
          id: l.id,
          brand: l.brand,
          productName: l.productName,
          packQuantity: l.packQuantity,
        }))
      );
      setCsvRows(result.rows);
      setCsvDuplicates(dups);
      setCsvError('');
      return result.rows;
    } catch {
      setCsvError('파일을 불러올 수 없습니다.');
      setCsvRows([]);
      setCsvDuplicates([]);
      return [];
    }
  }

  async function quickReplaceAll() {
    const confirmed = window.confirm(
      `기존 상품 ${lenses.length}개를 모두 삭제하고 첨부된 CSV 파일(${161}개)로 교체합니다.\n계속하시겠습니까?`
    );
    if (!confirmed) return;

    setReplacing(true);
    clearMessages();

    try {
      const resp = await fetch('/lens_prices.csv');
      const text = await resp.text();
      const result = parseCsv(text);
      const newRows = result.rows;

      if (newRows.length === 0) {
        setCsvError('CSV 파일에서 유효한 데이터를 찾을 수 없습니다.');
        return;
      }

      // Delete all existing products
      for (const lens of lenses) {
        try {
          await deleteDoc(doc(lensCollection, lens.id));
        } catch {
          // continue even if some deletes fail
        }
      }

      // Add all new products
      let added = 0;
      let failed = 0;
      for (const row of newRows) {
        try {
          await addDoc(lensCollection, rowToData(row));
          added++;
        } catch {
          failed++;
        }
      }

      if (failed === 0) {
        setCsvSuccess(
          `기존 ${lenses.length}개 삭제 후 ${added}개 상품이 등록되었습니다.`
        );
      } else {
        setCsvError(`${added}개 등록 성공, ${failed}개 실패.`);
      }
    } catch {
      setCsvError('데이터 교체 중 오류가 발생했습니다.');
    } finally {
      setReplacing(false);
    }
  }

  async function replaceAllData() {
    if (csvRows.length === 0) return;
    if (csvDuplicates.length > 0 && !replaceMode) {
      setCsvError(
        `중복 항목 ${csvDuplicates.length}개가 있습니다. 중복 항목을 CSV에서 삭제하거나 수정한 후 다시 시도해 주세요.`
      );
      return;
    }

    const confirmed = window.confirm(
      `기존 상품 ${lenses.length}개를 모두 삭제하고 CSV ${csvRows.length}개로 교체합니다.\n계속하시겠습니까?`
    );
    if (!confirmed) return;

    setReplacing(true);
    clearMessages();

    try {
      // Delete all existing products
      for (const lens of lenses) {
        try {
          await deleteDoc(doc(lensCollection, lens.id));
        } catch {
          // continue even if some deletes fail
        }
      }

      // Add all new products
      let added = 0;
      let failed = 0;
      for (const row of csvRows) {
        try {
          await addDoc(lensCollection, rowToData(row));
          added++;
        } catch {
          failed++;
        }
      }

      if (failed === 0) {
        setCsvSuccess(
          `기존 ${lenses.length}개 삭제 후 ${added}개 상품이 등록되었습니다.`
        );
        clearCsv();
        setReplaceMode(false);
      } else {
        setCsvError(`${added}개 등록 성공, ${failed}개 실패.`);
      }
    } catch {
      setCsvError('데이터 교체 중 오류가 발생했습니다.');
    } finally {
      setReplacing(false);
    }
  }

  // Brand list for filter
  const brands = useMemo(() => {
    const set = new Set<string>();
    lenses.forEach((l) => {
      if (l.brand.trim()) set.add(l.brand.trim());
    });
    return ['전체', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'ko-KR'))];
  }, [lenses]);

  const filteredLenses = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return lenses
      .filter((lens) => {
        if (brandFilter !== '전체' && lens.brand.trim() !== brandFilter) return false;
        if (!keyword) return true;
        return (
          lens.brand.toLowerCase().includes(keyword) ||
          lens.productName.toLowerCase().includes(keyword) ||
          lens.specification.toLowerCase().includes(keyword) ||
          lens.lensType.toLowerCase().includes(keyword) ||
          lens.wearType.toLowerCase().includes(keyword)
        );
      })
      .sort((a, b) => {
        const brandCmp = a.brand.localeCompare(b.brand, 'ko-KR');
        if (brandCmp !== 0) return brandCmp;
        return a.productName.localeCompare(b.productName, 'ko-KR');
      });
  }, [lenses, search, brandFilter]);

  // Group the currently filtered products without changing Firestore data.
  const groupedLenses = useMemo(() => {
    const grouped = new Map<string, Map<string, Lens[]>>();
    for (const lens of filteredLenses) {
      const brandName = lens.brand.trim() || '기타 브랜드';
      const category = [lens.wearType.trim(), lens.lensType.trim()]
        .filter(Boolean)
        .join(' · ') || '기타 제품군';
      if (!grouped.has(brandName)) grouped.set(brandName, new Map());
      const categories = grouped.get(brandName)!;
      if (!categories.has(category)) categories.set(category, []);
      categories.get(category)!.push(lens);
    }
    return Array.from(grouped, ([brandName, categories]) => ({
      brandName,
      categories: Array.from(categories, ([categoryName, items]) => ({ categoryName, items })),
    }));
  }, [filteredLenses]);

  const nonDupCount = csvRows.length - csvDuplicates.length;

  return (
    <div className="app">
      <header className="header">
        <div className="logo">GLOSS OPTICAL</div>
        <h1>{lensTab === 'contact' ? '콘택트렌즈 가격표' : '안경렌즈 가격표'}</h1>
        <p className="subtitle">제품명과 굴절률별 가격을 확인해 보세요.</p>
      </header>

      <div className="status-bar">
        <span className="status-text">{status}</span>
        {error && <span className="alert-error" role="alert">{error}</span>}
        {success && <span className="alert-success">{success}</span>}
      </div>

      <nav className="lens-type-tabs" aria-label="렌즈 가격표 종류">
        <button type="button" className={lensTab === 'contact' ? 'lens-type-tab active' : 'lens-type-tab'} onClick={() => setLensTab('contact')}><span className="tab-icon" aria-hidden="true">◉</span><span>콘택트렌즈</span></button>
        <button type="button" className={lensTab === 'spectacle' ? 'lens-type-tab active' : 'lens-type-tab'} onClick={() => setLensTab('spectacle')}><span className="tab-icon" aria-hidden="true">⌁</span><span>안경렌즈</span></button>
      </nav>

      {lensTab === 'spectacle' && (
        <section className="spectacle-section">
          <input className="search-input spectacle-search" aria-label="안경렌즈 검색" placeholder="제조사, 제품군, 제품명, 굴절률 검색" value={spectacleSearch} onChange={(e) => setSpectacleSearch(e.target.value)} />
          <p className="spectacle-note">에실로·니콘 가격표 · 원본 대조 전 검토용 데이터입니다. 실제 판매·견적 시 최신 가격표를 확인하세요.</p>
          {spectacleError && <p className="alert-error">{spectacleError}</p>}
           <p className="spectacle-note">옵션 데이터: {optionLoadError ? `불러오기 실패 (${optionLoadError})` : optionLoaded ? `${lensOptions.length}개 로딩 완료` : '불러오는 중'}</p>
          <p className="result-count">굴절률별 가격 {spectacleGroups.reduce((n,g) => n + g.families.reduce((m,f) => m + f.products.reduce((k,p) => k + p.variants.length,0),0),0)}개</p>
          <div className="spectacle-groups">
            {spectacleGroups.map((group) => (
              <details className="brand-group" key={group.manufacturer} open={spectacleSearch.trim() ? true : undefined}>
                <summary className="group-heading brand-heading"><span className="spectacle-brand-icon" aria-hidden="true">◉</span><span className="group-heading-text">{group.manufacturer}</span><span className="spectacle-total">{group.families.reduce((n,f)=>n+f.products.reduce((m,p)=>m+p.variants.length,0),0)}개 가격</span><span className="group-chevron">⌄</span></summary>
                <div className="category-list">
                  {group.families.map((family) => (
                    <details className="category-group" key={family.family} open={spectacleSearch.trim() ? true : undefined}>
                      <summary className="group-heading category-heading">{family.family}<span className="group-count">{family.products.length}개 제품</span><span className="group-chevron">⌄</span></summary>
                      <div className="spectacle-products">
                        {family.products.map((product) => (
                          <details className="spectacle-product" key={product.name} open={spectacleSearch.trim() ? true : undefined}>
                            <summary className="spectacle-product-title">{product.name}<span className="group-chevron">⌄</span></summary>
                            <div className="spectacle-variants"><div className="spectacle-variant spectacle-variant-head"><span>굴절률</span><span>권장소비자가격</span></div>
                              {product.variants.map((v,i) => (
                                <LensVariant key={`${v.index}-${i}`} variant={v} option={lensOptions.find(o=>o.manufacturer.trim()===v.manufacturer.trim() && o.name.trim()===v.name.trim() && String(o.index).trim()===String(v.index).trim())} />
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            ))}
          </div>
          {!spectacleError && spectacleGroups.length === 0 && <p className="no-results">검색 결과가 없습니다.</p>}
        </section>
      )}

      {lensTab === 'contact' && <>
      {/* Customer view: search + brand filter + product list */}
      <section className="customer-section">
        <div className="search-bar">
          <input
            className="search-input"
            placeholder="브랜드, 제품명, 규격 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="brand-filter"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
          >
            {brands.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        <p className="result-count">검색 결과 {filteredLenses.length}개</p>

        <div className="card-list grouped-list">
          {groupedLenses.map(({ brandName, categories }) => (
            <details className="brand-group" key={`${search.trim()}|${brandName}`} open={search.trim() ? true : undefined}>
              <summary className="group-heading brand-heading">
                <span className="group-heading-text">{brandName}</span>
                <span className="group-count">{categories.reduce((total, c) => total + c.items.length, 0)}개</span>
                <span className="group-chevron" aria-hidden="true">⌄</span>
              </summary>
              <div className="category-list">
                {categories.map(({ categoryName, items }) => (
                  <details className="category-group" key={`${search.trim()}|${brandName}|${categoryName}`} open={search.trim() ? true : undefined}>
                    <summary className="group-heading category-heading">
                      <span className="group-heading-text">{categoryName}</span>
                      <span className="group-count">{items.length}개</span>
                      <span className="group-chevron" aria-hidden="true">⌄</span>
                    </summary>
                    <div className="category-cards">
                      {items.map((lens) => (
                    <article className="lens-card" key={lens.id}>
                      <div className="card-left">
                        <span className="brand-badge">{lens.brand}</span>
                        <h2 className="product-name">{lens.productName}</h2>
                        <div className="card-meta">
                          {lens.lensType && <span className="meta-tag">{lens.lensType}</span>}
                          {lens.wearType && <span className="meta-tag">{lens.wearType}</span>}
                          {lens.packQuantity && (
                            <span className="meta-tag meta-pack">{lens.packQuantity}</span>
                          )}
                        </div>
                      </div>
                      <div className="card-right">
                        <div className="price-block">
                          <span className="price-main">{priceText(lens.displayPrice)}</span>
                          {lens.oldPrice !== null && (
                            <span className="price-old">
                              이전 {priceText(lens.oldPrice)}
                            </span>
                          )}
                          {lens.unitPrice !== null && (
                            <span className="price-unit">
                              1개당 {priceText(lens.unitPrice)}
                            </span>
                          )}
                          {lens.displayPrice === null && lens.unitPrice === null && lens.price > 0 && (
                            <span className="price-main">{lens.price.toLocaleString('ko-KR')}원</span>
                          )}
                        </div>
                        {user && (
                          <div className="card-actions">
                            <button className="btn-sm btn-edit" onClick={() => editLens(lens)}>수정</button>
                            <button className="btn-sm btn-del" onClick={() => removeLens(lens.id)}>삭제</button>
                          </div>
                        )}
                      </div>
                    </article>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>

        {filteredLenses.length === 0 && (
          <p className="no-results">검색 결과가 없습니다.</p>
        )}
      </section>

      </>}

      {/* Admin section */}
      <div className="admin-toggle">
        <button className="btn-toggle" onClick={() => setAdminOpen(!adminOpen)}>
          {adminOpen ? '관리자 메뉴 닫기' : '관리자'}
        </button>
      </div>

      {adminOpen && (
        <section className="admin-section">
          {!user ? (
            <div className="admin-login">
              <h2>관리자 로그인</h2>
              <div className="form-row">
                <input
                  type="email"
                  className="form-input"
                  placeholder="관리자 이메일"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="form-row">
                <input
                  type="password"
                  className="form-input"
                  placeholder="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') login(); }}
                />
              </div>
              <button className="btn-primary" onClick={login}>로그인</button>
            </div>
          ) : (
            <div className="admin-panel">
              <div className="admin-header">
                <h2>상품 관리</h2>
                <span className="admin-email">{user.email}</span>
              </div>

              {/* CSV Upload */}
              <div className="csv-section">
                <h3>CSV 일괄 등록</h3>
                <p className="csv-help">
                  엑셀에서 CSV 파일로 저장한 후 아래 버튼으로 선택하세요.
                  업로드 전에 미리 확인할 수 있습니다.
                </p>

                <div className="quick-replace-section">
                  <button
                    className="btn-primary btn-danger btn-large"
                    onClick={quickReplaceAll}
                    disabled={replacing}
                  >
                    {replacing ? '교체 중...' : '첨부 파일로 전체 교체 (기존 데이터 삭제 + 새 등록)'}
                  </button>
                  <p className="quick-replace-hint">
                    이 버튼을 누르면 기존 데이터를 모두 삭제하고 첨부된 가격표 161개로 새로 교체합니다.
                  </p>
                </div>

                <div className="csv-upload-row">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileSelect}
                    className="file-input"
                  />
                  <button className="btn-secondary btn-bundled" onClick={() => loadBundledCsv()}>
                    첨부 파일 미리보기
                  </button>
                  {csvFileName && (
                    <button className="btn-sm btn-cancel" onClick={clearCsv}>취소</button>
                  )}
                </div>

                <div className="csv-mode-row">
                  <label className="csv-mode-label">
                    <input
                      type="checkbox"
                      checked={replaceMode}
                      onChange={(e) => setReplaceMode(e.target.checked)}
                    />
                    기존 데이터 삭제 후 새로 교체
                  </label>
                </div>

                {csvError && <p className="alert-error" role="alert">{csvError}</p>}
                {csvSuccess && <p className="alert-success">{csvSuccess}</p>}

                {csvRows.length > 0 && (
                  <div className="csv-preview">
                    <div className="csv-preview-header">
                      <strong>미리보기: {csvRows.length}개 항목</strong>
                      {csvDuplicates.length > 0 && (
                        <span className="dup-warning">
                          중복 {csvDuplicates.length}개 (업로드 불가)
                        </span>
                      )}
                      {csvDuplicates.length === 0 && (
                        <span className="dup-ok">중복 없음 — 등록 가능 {nonDupCount}개</span>
                      )}
                    </div>

                    {csvDuplicates.length > 0 && (
                      <div className="dup-list">
                        <p className="dup-title">중복 항목 (기존 상품과 겹침):</p>
                        <ul>
                          {csvDuplicates.map((d) => (
                            <li key={d.index}>
                              {d.row.brand} — {d.row.productName} ({d.row.packQuantity})
                              <span className="dup-existing">
                                (기존: {d.existingProductName})
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="dup-hint">
                          중복 항목을 CSV 파일에서 삭제하거나 제품명을 변경한 후 다시 선택해 주세요.
                        </p>
                      </div>
                    )}

                    <div className="csv-table-wrap">
                      <table className="csv-table">
                        <thead>
                          <tr>
                            <th>브랜드</th>
                            <th>렌즈구분</th>
                            <th>제품명</th>
                            <th>착용유형</th>
                            <th>포장수량</th>
                            <th>권장/표시가격</th>
                            <th>이전 가격</th>
                            <th>1개당 가격</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvRows.map((row, i) => {
                            const isDup = csvDuplicates.some((d) => d.index === i);
                            return (
                              <tr key={i} className={isDup ? 'row-dup' : ''}>
                                <td>{row.brand}</td>
                                <td>{row.lensType}</td>
                                <td>{row.productName}</td>
                                <td>{row.wearType}</td>
                                <td>{row.packQuantity}</td>
                                <td>{priceText(row.displayPrice)}</td>
                                <td>{priceText(row.oldPrice)}</td>
                                <td>{priceText(row.unitPrice)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {replaceMode ? (
                      <button
                        className="btn-primary btn-danger"
                        onClick={replaceAllData}
                        disabled={replacing || csvDuplicates.length > 0}
                      >
                        {replacing ? '교체 중...' : `기존 데이터 삭제 후 ${nonDupCount}개 등록`}
                      </button>
                    ) : (
                      <button
                        className="btn-primary"
                        onClick={uploadCsv}
                        disabled={csvUploading || csvDuplicates.length > 0}
                      >
                        {csvUploading ? '업로드 중...' : `${nonDupCount}개 등록`}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <hr className="divider" />

              {/* Single product edit form */}
              <div className="edit-section">
                <h3>{editingId ? '상품 수정' : '상품 개별 추가'}</h3>
                <div className="form-grid">
                  <div className="form-row">
                    <label className="form-label">브랜드</label>
                    <input
                      className="form-input"
                      placeholder="예: 클라렌"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label className="form-label">렌즈 구분</label>
                    <input
                      className="form-input"
                      placeholder="예: 투명, 컬러"
                      value={lensType}
                      onChange={(e) => setLensType(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label className="form-label">제품명</label>
                    <input
                      className="form-input"
                      placeholder="제품명"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label className="form-label">착용 유형</label>
                    <input
                      className="form-input"
                      placeholder="예: 1일, 1개월"
                      value={wearType}
                      onChange={(e) => setWearType(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label className="form-label">포장수량</label>
                    <input
                      className="form-input"
                      placeholder="예: 30개입"
                      value={packQuantity}
                      onChange={(e) => setPackQuantity(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label className="form-label">규격 (기존)</label>
                    <input
                      className="form-input"
                      placeholder="예: 30개입"
                      value={specification}
                      onChange={(e) => setSpecification(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label className="form-label">권장/표시가격</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="비어 있으면 미입력"
                      value={displayPrice}
                      onChange={(e) => setDisplayPrice(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label className="form-label">이전 가격</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="비어 있으면 미입력"
                      value={oldPrice}
                      onChange={(e) => setOldPrice(e.target.value)}
                    />
                  </div>
                  <div className="form-row">
                    <label className="form-label">1개당 가격</label>
                    <input
                      className="form-input"
                      type="text"
                      inputMode="numeric"
                      placeholder="비어 있으면 미입력"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button className="btn-primary" onClick={saveLens}>
                    {editingId ? '수정 저장' : '상품 추가'}
                  </button>
                  <button className="btn-secondary" onClick={resetForm}>입력 초기화</button>
                  <button className="btn-secondary" onClick={() => signOut(auth)}>로그아웃</button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="footer">
        <small>GLOSS OPTICAL · CONTACT LENS PRICE</small>
      </footer>
    </div>
  );
}
