/** Фиче-флаги читаются из runtimeConfig: их можно менять без пересборки. */
export function useFlags() {
  const config = useRuntimeConfig()
  return {
    mockScanHistory: config.public.mockScanHistory === true,
    demoScan: config.public.demoScan === true,
  }
}
