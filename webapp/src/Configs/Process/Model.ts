export interface HistogramProcessRules {
  dropPctDark:number; // what percentage of not-zero-already dark pixels will we drop when stretching the image?
  dropPctLight:number; // what percentage of not-255-already bright pixels will we drop when stretching the image?
}
export interface ProcessModel {
  day: HistogramProcessRules;
  night: HistogramProcessRules;
}