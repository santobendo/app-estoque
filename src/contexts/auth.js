import { createContext, useContext } from 'react';

/* O contexto e o hook moram aqui, separados do AuthProvider, porque um
   arquivo que exporta componente e não-componente ao mesmo tempo quebra o
   hot reload — era um dos erros de react-refresh/only-export-components da
   dívida técnica. AuthContext.jsx agora exporta só o provider.

   Arquivo .js, e não .jsx, de propósito: não tem JSX nenhum, e a extensão
   deixa óbvio que aqui não vive componente. */
export const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);
