import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';

document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';

createRoot(document.getElementById('root')!).render(<App />);
