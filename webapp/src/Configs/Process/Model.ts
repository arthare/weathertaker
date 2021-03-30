export interface HistogramProcessRules {
  dropPctDark:number; // what percentage of not-zero-already dark pixels will we drop when stretching the image?
  dropPctLight:number; // what percentage of not-255-already bright pixels will we drop when stretching the image?
  middle: number; // when we restretch the median pixel, where should be put it?
  minStretchSpan: number; // when we stretch, what's the minimum amount of stretching we should allow.  So if a histogram is like from 4 to 6 (nighttime), we don't want to treat it as a span of 2 or else shit gets blown to basically black & white.
}
export interface ProcessModel {
  day: HistogramProcessRules;
  night: HistogramProcessRules;
  do:boolean;
}