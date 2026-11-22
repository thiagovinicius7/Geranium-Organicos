import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import SobraLoja from './components/SobraLoja.tsx';
import './index.css';

// Link da loja (#/sobra/<id>): abre só o formulário de sobra, sem login.
const sobra = window.location.hash.match(/^#\/sobra\/([A-Za-z0-9]{10,40})/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {sobra ? <SobraLoja id={sobra[1]} /> : <App />}
  </StrictMode>,
);
