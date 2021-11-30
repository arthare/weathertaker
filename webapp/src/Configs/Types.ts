export interface SecureRequest {
  apiKey:string;
}

export interface RecentRawFileSubmissionRequest extends SecureRequest {
  imageBase64: string;
  when: "noon"|"night";
}
export interface RecentRawFileRequest {
  sourceId:number;
  when: "noon"|"night";
}


export interface GetConfigRequest extends SecureRequest {
  // no params
}
export interface GetConfigResponse {
  models: any;
  noonBase64: string;
  nightBase64: string;
}



export interface ImageSubmissionRequest extends SecureRequest {
  imageBase64:string;
  localIp:string;
}

export enum ReactionType {
  Wow = 'wow',
  Storm = 'storm',
  Download = 'download',
}

export interface ReactSubmission {
how:ReactionType; // how are we reacting?
videoId:number|string;
}
export interface NewModelRequest {
  pwd:string;
  model:any;
  sourceId: number;
}

export const IMAGE_SUBMISSION_WIDTH = 1640;
export const IMAGE_SUBMISSION_HEIGHT = 1232;