import { createContext, useContext } from 'react';

/* Mesmo motivo do contexts/auth.js: o provider é componente, o hook não, e
   os dois no mesmo arquivo atrapalham o hot reload. */
export const LocalContext = createContext({});

export const useLocal = () => useContext(LocalContext);
