import { useId, useMemo, type CSSProperties } from "react";
import { pluginIcon } from "@fxbot/sdk/client";

// A plugin's icon, drawn from its key. Its four colors come for both themes, as variables, and index.css picks.
export function PluginIcon({ iconKey, size = 36 }: { iconKey: string; size?: number }) {
  const id = useId().replace(/\W/g, "");
  const { path, turn, light, dark } = useMemo(() => pluginIcon(iconKey), [iconKey]);
  const colors = Object.fromEntries([...light.map((c, i) => [`--l${i}`, c]), ...dark.map((c, i) => [`--d${i}`, c])]) as CSSProperties;
  const stop = (offset: number, i: number) => <stop offset={offset} style={{ stopColor: `var(--c${i})` }} />;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" className="plugin-icon shrink-0" style={colors}>
      <defs>
        <linearGradient id={`${id}t`} gradientTransform={`rotate(${turn} .5 .5)`}>
          {stop(0, 0)}
          {stop(1, 1)}
        </linearGradient>
        <linearGradient id={`${id}s`} gradientTransform={`rotate(${(turn + 90) % 360} .5 .5)`}>
          {stop(0, 2)}
          {stop(1, 3)}
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="24" fill={`url(#${id}t)`} />
      <path d={path} fill={`url(#${id}s)`} />
    </svg>
  );
}
