
/**
 * 异步延迟指定时长
 * @param delay 延迟时间，单位为毫秒
 * @returns
 */
export async function sleep(delay: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true)
    }, delay)
  })
}
