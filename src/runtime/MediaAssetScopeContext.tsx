import { createContext, useContext } from "react";

export const MediaAssetScopeReadyContext = createContext(true);

export function useMediaAssetScopeReady() {
  return useContext(MediaAssetScopeReadyContext);
}
