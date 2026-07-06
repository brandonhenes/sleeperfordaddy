/** Typed fetch helper for calling our backend API */
type ApiFetchOptions = RequestInit & {
  timeoutMs?: number;
  timeoutMessage?: string;
};

export async function apiFetch<T>(
  path: string,
  options?: ApiFetchOptions
): Promise<T> {
  const {
    timeoutMs = 45_000,
    timeoutMessage = "Request timed out. Try again.",
    signal,
    headers: inputHeaders,
    ...fetchOptions
  } = options ?? {};
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  const abortFromParent = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  const headers = new Headers(inputHeaders);
  if (!headers.has("Content-Type") && !(fetchOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(didTimeout ? timeoutMessage : "Request canceled.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortFromParent);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as { message?: string }).message ||
        `API error: ${response.status}`
    );
  }

  return response.json() as Promise<T>;
}
