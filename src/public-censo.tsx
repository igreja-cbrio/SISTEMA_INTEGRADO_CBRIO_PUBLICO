


























import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CensoPublica from './pages/public/CensoPublica';
import './index.css';




const doCaminho = window.location.pathname.match(/\/censo\/p\/([^/?#]+)/);
const slug = doCaminho
  ? decodeURIComponent(doCaminho[1])
  : new URLSearchParams(window.location.search).get('slug') || '';



const entrada = `/censo/p/${encodeURIComponent(slug)}${window.location.search}`;

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[entrada]}>
    <Routes>
      <Route path="/censo/p/:slug" element={<CensoPublica />} />
    </Routes>
  </MemoryRouter>,
);
