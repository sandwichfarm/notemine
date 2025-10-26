import { createContext, useContext, ParentComponent } from 'solid-js';
import { EventStore } from 'applesauce-core';
import { RelayPool } from 'applesauce-relay';
import { eventStore, relayPool } from '../lib/applesauce';

interface EventStoreContextValue {
  eventStore: EventStore;
  relayPool: RelayPool;
}

const EventStoreContext = createContext<EventStoreContextValue>();

export const EventStoreProvider: ParentComponent = (props) => {
  const value: EventStoreContextValue = {
    eventStore,
    relayPool,
  };

  return (
    <EventStoreContext.Provider value={value}>
      {props.children}
    </EventStoreContext.Provider>
  );
};

export function useEventStore() {
  const context = useContext(EventStoreContext);
  if (!context) {
    throw new Error('useEventStore must be used within EventStoreProvider');
  }
  return context;
}
