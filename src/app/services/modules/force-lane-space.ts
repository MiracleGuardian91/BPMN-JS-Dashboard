// src/app/bpmn/modules/force-lane-space.ts
import { is } from 'bpmn-js/lib/util/ModelUtil';

class ForceLaneSpace {
  static $inject = ['modeling'];

  constructor(modeling: any) {
    // monkey-patch Modeling#resizeLane to ALWAYS use balanced=false (space mode)
    const orig = modeling.resizeLane.bind(modeling);

    modeling.resizeLane = (
      laneShape: any,
      newBounds: any /*, balanced?: boolean */
    ) => {
      // ignore caller's "balanced" flag; force space mode
      return orig(laneShape, newBounds, false);
    };
  }
}

export default {
  __init__: ['forceLaneSpace'],
  forceLaneSpace: ['type', ForceLaneSpace],
};
