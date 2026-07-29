/* ============================================================================
   BOWVISION CONFIG  —  the only file you need to edit.

   The key below is the *publishable* key, which Roboflow designs to be public:
   it can only run inference, and Roboflow rate-limits it. It is NOT the private
   API key — never paste that one here, or into any file in this repo.

   Where to find both values:
     app.roboflow.com/jasper-fnpx4
       -> Settings -> API Keys -> "Publishable Key"   (starts rf_)
       -> Deploy page, the number in "bowdetector/N"  (the version)

   Leave publishableKey empty and the page still renders the full interface with
   a clear "not connected yet" note. Nothing looks broken either way.
   ========================================================================= */
window.BOWVISION_CONFIG = {
  publishableKey: 'rf_R1nDszQu0ghaoEgucFPzmcLgz2Q2',          // e.g. 'rf_XXXXXXXXXXXXXXXXXXXX'
  model: 'bowdetector',
  version: 1,                  // the N in bowdetector/N

  // Measured on real bow-hold stills, this model scores confident detections
  // in the 0.08-0.35 band, so the old 0.4 default hid every box even once
  // inference worked. 0.15 shows the true detections without the noise floor.
  confidence: 0.15,            // starting threshold; the slider overrides it
  overlap: 0.5,                // -> iouThreshold
  maxDetections: 20            // -> maxNumBoxes
};
