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
  publishableKey: '',          // e.g. 'rf_XXXXXXXXXXXXXXXXXXXX'
  model: 'bowdetector',
  version: 1,                  // the N in bowdetector/N

  confidence: 0.4,             // starting threshold; the slider overrides it
  overlap: 0.5,
  maxDetections: 20
};
