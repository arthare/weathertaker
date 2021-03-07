
export interface PostRequest {
    apiKey:string;
}

export interface ImageSubmissionRequest extends PostRequest {
    imageBase64:string;
}