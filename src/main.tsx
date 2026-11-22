import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import SobraLoja from './components/SobraLoja.tsx';
import LojaFixa from './components/LojaFixa.tsx';
import './index.css';

// Links da Bioloja, sem login: #/loja/<token> (fixo, abre a sobra mais
// recente) e #/sobra/<id> (um formulário específico).
const loja = window.location.hash.match(/^#\/loja\/([A-Za-z0-9]{10,40})/);
const sobra = window.location.hash.match(/^#\/sobra\/([A-Za-z0-9]{10,40})/);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {loja ? <LojaFixa token={loja[1]} /> : sobra ? <SobraLoja id={sobra[1]} /> : <App />}
  </StrictMode>,
);
