// File: client/api.ts (финальная чистая версия)
import * as serverApi from '../api';

export const apiClient = {
  listBhajans: serverApi.listBhajans,
  getBhajanDetail: serverApi.getBhajanDetail,
  getChordDiagram: serverApi.getChordDiagram,
};

// Этот тип нужен для компонента BhajanCard
export type inferRPCOutputType<TRouteKey extends string> = any;