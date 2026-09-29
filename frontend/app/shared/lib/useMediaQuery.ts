import { onBeforeUnmount, ref } from 'vue'

export function useMediaQuery(query: string) {
  const matches = ref(false)

  if (import.meta.client) {
    const list = window.matchMedia(query)
    matches.value = list.matches
    const onChange = () => {
      matches.value = list.matches
    }
    list.addEventListener('change', onChange)
    onBeforeUnmount(() => list.removeEventListener('change', onChange))
  }

  return matches
}
