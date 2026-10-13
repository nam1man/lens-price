
import { useEffect, useState } from 'react';
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
import './App.css';

type Lens = {
  id: string;
  brand: string;
  productName: string;
  specification: string;
  price: number;
};

const lensCollection = collection(db, 'products', 'name', 'Lens');

export default function App() {
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('전체');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [brand, setBrand] = useState('');
  const [productName, setProductName] = useState('');
  const [specification, setSpecification] = useState('');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState('Firebase 연결 확인 중...');
  const [error, setError] = useState('');

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

  const brands = [
    '전체',
    ...Array.from(
      new Set(lenses.map((lens) => lens.brand.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'ko')),
  ];

  function resetForm() {
    setEditingId(null);
    setBrand('');
    setProductName('');
    setSpecification('');
    setPrice('');
  }

  function editLens(lens: Lens) {
    setEditingId(lens.id);
    setBrand(lens.brand);
    setProductName(lens.productName);
    setSpecification(lens.specification);
    setPrice(String(lens.price));
    setAdminOpen(true);
  }

  async function login() {
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setPassword('');
      setAdminOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인 실패');
    }
  }

  async function saveLens() {
    if (!brand.trim() || !productName.trim() || !price.trim()) {
      setError('브랜드, 제품명, 가격을 입력해 주세요.');
      return;
    }

    const numericPrice = Number(price.replace(/,/g, ''));

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setError('올바른 가격을 입력해 주세요.');
      return;
    }

    const data = {
      brand: brand.trim(),
      productName: productName.trim(),
      specification: specification.trim(),
      price: numericPrice,
    };

    setError('');

    try {
      if (editingId) {
        await updateDoc(doc(lensCollection, editingId), data);
      } else {
        await addDoc(lensCollection, data);
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    }
  }

  async function removeLens(id: string) {
    if (!window.confirm('이 상품을 삭제할까요?')) return;

    setError('');

    try {
      await deleteDoc(doc(lensCollection, id));
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    }
  }

  const keyword = search.trim().toLowerCase();

  const filteredLenses = lenses.filter((lens) => {
    const matchesBrand =
      selectedBrand === '전체' || lens.brand.trim() === selectedBrand;

    const matchesSearch =
      !keyword ||
      lens.brand.toLowerCase().includes(keyword) ||
      lens.productName.toLowerCase().includes(keyword) ||
      lens.specification.toLowerCase().includes(keyword);

    return matchesBrand && matchesSearch;
  });

  return (
    <main className="app">
      <header className="header">
        <div className="logo">GLOSS OPTICAL</div>
        <h1>콘택트렌즈 가격표</h1>
        <p>브랜드와 제품명을 확인해 보세요.</p>
      </header>

      <section className="results">
        <p className="connection-status">{status}</p>
        {error && <p role="alert" className="error-message">오류: {error}</p>}

        <input
          className="search-input"
          placeholder="브랜드 또는 제품명 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="brand-filter" aria-label="브랜드 선택">
          {brands.map((item) => (
            <button
              key={item}
              type="button"
              className={`brand-filter-button ${
                selectedBrand === item ? 'active' : ''
              }`}
              aria-pressed={selectedBrand === item}
              onClick={() => setSelectedBrand(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <p className="result-count">
          검색 결과 <strong>{filteredLenses.length}</strong>개
        </p>

        <div className="lens-list">
          {filteredLenses.map((lens) => (
            <article className="lens-card" key={lens.id}>
              <div className="lens-info">
                <span className="brand-name">{lens.brand}</span>
                <h2>{lens.productName}</h2>
                {lens.specification && (
                  <p className="lens-specification">{lens.specification}</p>
                )}
              </div>

              <div className="lens-price">
                <strong>{lens.price.toLocaleString('ko-KR')}원</strong>
                {user && (
                  <div className="admin-actions">
                    <button onClick={() => editLens(lens)}>수정</button>
                    <button onClick={() => removeLens(lens.id)}>삭제</button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>

        {filteredLenses.length === 0 && (
          <p className="empty-results">검색 결과가 없습니다.</p>
        )}

        <hr />

        <button onClick={() => setAdminOpen(!adminOpen)}>
          {adminOpen ? '관리자 메뉴 닫기' : '관리자'}
        </button>

        {adminOpen && (
          <section className="admin-panel">
            {!user ? (
              <div>
                <h2>관리자 로그인</h2>
                <input
                  type="email"
                  placeholder="관리자 이메일"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="비밀번호"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button onClick={login}>로그인</button>
              </div>
            ) : (
              <div>
                <h2>상품 관리</h2>
                <p>로그인: {user.email}</p>

                <input
                  placeholder="브랜드"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                />
                <input
                  placeholder="제품명"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                />
                <input
                  placeholder="규격 (예: 30개입)"
                  value={specification}
                  onChange={(e) => setSpecification(e.target.value)}
                />
                <input
                  type="number"
                  min="0"
                  placeholder="가격"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />

                <button onClick={saveLens}>
                  {editingId ? '수정 저장' : '상품 추가'}
                </button>
                <button onClick={resetForm}>입력 초기화</button>
                <button onClick={() => signOut(auth)}>로그아웃</button>
              </div>
            )}
          </section>
        )}
      </section>

      <footer>
        <small>GLOSS OPTICAL · CONTACT LENS PRICE</small>
      </footer>
    </main>
  );
}
