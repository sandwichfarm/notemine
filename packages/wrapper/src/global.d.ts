declare module '*.worker.js' {
  const WorkerFactory: () => Worker;
  export default WorkerFactory;
}

declare module '*.worker.ts' {
  const WorkerFactory: () => Worker;
  export default WorkerFactory;
}