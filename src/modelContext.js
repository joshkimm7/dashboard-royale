import { createContext, useContext } from 'react';

export const ModelContext = createContext(null);
/** The analysis computed once from the dataset (see lib/model.js). */
export const useModel = () => useContext(ModelContext);
