
export interface PostRequest {
    apiKey:string;
}

export interface ImageSubmissionRequest extends PostRequest {
    imageBase64:string;
}

export enum ReactionType {
  Wow = 'wow',
  Storm = 'storm',
}

export interface ReactSubmission {
  how:ReactionType; // how are we reacting?
  videoId:number|string;
}

export const IMAGE_SUBMISSION_WIDTH = 1920;
export const IMAGE_SUBMISSION_HEIGHT = 1080;