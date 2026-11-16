/**
 * Tracks the OS "reduce motion" setting. Every transition the spec specifies
 * must honour this — when true, animations collapse to instant / cross-fade with
 * no travel. Works on native (AccessibilityInfo) and web (prefers-reduced-motion
 * via react-native-web).
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
