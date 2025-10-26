import { createContext, useContext, Component, JSX, createSignal, Accessor } from 'solid-js';

interface TooltipContextType {
  activeTooltip: Accessor<string | null>;
  setActiveTooltip: (id: string | null) => void;
  tooltipContent: Accessor<string>;
  setTooltipContent: (content: string) => void;
  closeAllPanels?: () => void; // Optional callback from Layout
  setCloseAllPanels: (fn: () => void) => void;
}

const TooltipContext = createContext<TooltipContextType>();

export const TooltipProvider: Component<{ children: JSX.Element }> = (props) => {
  const [activeTooltip, setActiveTooltip] = createSignal<string | null>(null);
  const [tooltipContent, setTooltipContent] = createSignal<string>('');
  const [closeAllPanels, setCloseAllPanels] = createSignal<(() => void) | undefined>(undefined);

  const value: TooltipContextType = {
    activeTooltip,
    setActiveTooltip,
    tooltipContent,
    setTooltipContent,
    get closeAllPanels() {
      return closeAllPanels();
    },
    setCloseAllPanels: (fn: () => void) => setCloseAllPanels(() => fn),
  };

  return (
    <TooltipContext.Provider value={value}>
      {props.children}
    </TooltipContext.Provider>
  );
};

export function useTooltip(): TooltipContextType {
  const context = useContext(TooltipContext);
  if (!context) {
    throw new Error('useTooltip must be used within TooltipProvider');
  }
  return context;
}
