import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { preloadCaveat600 } from './utils/handwritingFont';

preloadCaveat600();

createRoot(document.getElementById('root')!).render(<App />);
