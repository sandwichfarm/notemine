import { createContext, useContext, ParentComponent, createSignal } from 'solid-js';
import type { MiningState } from '../hooks/usePowMining';

interface MiningContextType {
  globalMiningState: () => MiningState;
  setGlobalMiningState: (state: MiningState) => void;
}

const MiningContext = createContext<MiningContextType>();

export const MiningProvider: ParentComponent = (props) => {
  const [globalMiningState, setGlobalMiningState] = createSignal<MiningState>({
    mining: false,
    hashRate: 0,
    overallBestPow: null,
    workersBestPow: [],
    result: null,
    error: null,
  });

  return (
    <MiningContext.Provider value={{ globalMiningState, setGlobalMiningState }}>
      {props.children}
    </MiningContext.Provider>
  );
};

export const useMining = () => {
  const context = useContext(MiningContext);
  if (!context) {
    throw new Error('useMining must be used within MiningProvider');
  }
  return context;
};
