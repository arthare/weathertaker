export interface HistogramProcessRules {
  dropPctDark:number; // what percentage of not-zero-already dark pixels will we drop when stretching the image?
  dropPctLight:number; // what percentage of not-255-already bright pixels will we drop when stretching the image?
  middle: number; // when we restretch the median pixel, where should be put it?
  minStretchSpan: number; // when we stretch, what's the minimum amount of stretching we should allow.  So if a histogram is like from 4 to 6 (nighttime), we don't want to treat it as a span of 2 or else shit gets blown to basically black & white.

  // when we stretch, how low do we let the center point get?  In a dark center, we might have {low: 0, mean: 0.1, high: 30}, which means any pixel value above 1 will get stretched to "middle" or higher.
  // centerPointMin will constrain the "mean" to (low + centerPointMin*(high-low)) so that we don't blast things quite that badly
  centerPointMin: number; // 0...1
  centerPointMax: number; // 0...1
}
export interface ProcessModel {
  day: HistogramProcessRules;
  night: HistogramProcessRules;
  do:boolean;
}