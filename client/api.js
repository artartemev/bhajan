// File: client/api.ts (финальная чистая версия)
import * as serverApi from '../api';
export var apiClient = {
    listBhajans: serverApi.listBhajans,
    getBhajanDetail: serverApi.getBhajanDetail,
    getChordDiagram: serverApi.getChordDiagram,
};
