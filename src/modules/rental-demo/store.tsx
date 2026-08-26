"use client";

import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  activateDemoLease, addDemoLease, addDemoProperty, addDemoTenant, addDemoUnit, closeDemoLease,
  initialDemoRentalState, type DemoLease, type DemoProperty, type DemoRentalState, type DemoTenant, type DemoUnit,
} from "@/modules/rental-demo/model";

type DemoStore = {
  state: DemoRentalState;
  createProperty: (input: Omit<DemoProperty, "id">) => string;
  createUnit: (input: Omit<DemoUnit, "id">) => string;
  createTenant: (input: Omit<DemoTenant, "id" | "portalAccess">) => string;
  createLease: (input: Omit<DemoLease, "id" | "status">) => string;
  activateLease: (id: string) => void;
  closeLease: (id: string, endDate: string) => void;
};

const DemoRentalContext = createContext<DemoStore | null>(null);

export function DemoRentalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialDemoRentalState);
  const counter = useRef(0);
  const nextId = (prefix: string) => `${prefix}-${Date.now()}-${counter.current += 1}`;
  const value = useMemo<DemoStore>(() => ({
    state,
    createProperty(input) {
      const id = nextId("property");
      setState((current) => addDemoProperty(current, input, id, nextId("unit")));
      return id;
    },
    createUnit(input) { const id = nextId("unit"); setState((current) => addDemoUnit(current, input, id)); return id; },
    createTenant(input) { const id = nextId("tenant"); setState((current) => addDemoTenant(current, input, id)); return id; },
    createLease(input) { const id = nextId("lease"); setState((current) => addDemoLease(current, input, id)); return id; },
    activateLease(id) { setState((current) => activateDemoLease(current, id)); },
    closeLease(id, endDate) { setState((current) => closeDemoLease(current, id, endDate)); },
  }), [state]);
  return <DemoRentalContext.Provider value={value}>{children}</DemoRentalContext.Provider>;
}

export function useDemoRental() {
  const value = useContext(DemoRentalContext);
  if (!value) throw new Error("DEMO_RENTAL_CONTEXT_MISSING");
  return value;
}
