function getWeightParams(): string {
  try {
    const raw = localStorage.getItem("edge-source-weights");
    if (!raw) return "";
    const w = JSON.parse(raw);
    if (w.fc === 1 && w.ktc === 1 && w.dp === 1) return "";
    return `fc_w=${w.fc}&ktc_w=${w.ktc}&dp_w=${w.dp}`;
  } catch { return ""; }
}

/** Typed fetch helper for calling our backend API */
export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const wp = getWeightParams();
  const url = wp ? (path.includes("?") ? `${path}&${wp}` : `${path}?${wp}`) : path;

  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as { message?: string }).message ||
        `API error: ${response.status}`
    );
  }

  return response.json() as Promise<T>;
}
