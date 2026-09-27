import { useContext } from 'react';
import { ConfigContext } from '../store/contexts';

export const useConfig = () => useContext(ConfigContext);
