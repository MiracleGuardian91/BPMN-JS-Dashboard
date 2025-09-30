// src/app/bpmn/modules/shift-connections-by-waypoints.ts
import { is } from 'bpmn-js/lib/util/ModelUtil';

const EPS = 0.5;

function isLane(e: any) {
  return e && is(e.businessObject, 'bpmn:Lane');
}
function isParticipant(e: any) {
  return e && is(e.businessObject, 'bpmn:Participant');
}
function isConnection(e: any) {
  return !!e && !!e.waypoints;
}

function findParticipant(e: any) {
  let p = e?.parent;
  while (p && !isParticipant(p)) p = p.parent;
  return p;
}

export default {
  __init__: ['shiftConnectionsByWaypoints'],
  shiftConnectionsByWaypoints: [
    'type',
    class ShiftConnectionsByWaypoints {
      static $inject = ['eventBus', 'elementRegistry', 'modeling'];

      private preLaneBounds: { top: number; bottom: number } | null = null;
      private preConnWps: Record<string, { x: number; y: number }[]> = {};

      constructor(
        private eventBus: any,
        private elementRegistry: any,
        private modeling: any
      ) {
        // PRE: remember which divider moved + snapshot all connection waypoints
        eventBus.on('commandStack.lane.resize.preExecute', (e: any) => {
          const lane = e?.context?.lane || e?.context?.shape;
          if (!isLane(lane)) return;

          this.preLaneBounds = { top: lane.y, bottom: lane.y + lane.height };
          this.preConnWps = {};

          const participant = findParticipant(lane);
          if (!participant) return;

          // collect every connection rendered inside this pool
          (participant.children || []).forEach((el: any) => {
            if (isConnection(el)) {
              this.preConnWps[el.id] = el.waypoints.map((wp: any) => ({
                x: wp.x,
                y: wp.y,
              }));
            }
          });
        });

        // POST: shift or relayout connections based on pre-waypoints
        eventBus.on(
          'commandStack.lane.resize.postExecute',
          -10000,
          (e: any) => {
            const lane = e?.context?.lane || e?.context?.shape;
            if (!isLane(lane) || !this.preLaneBounds) return;

            const participant = findParticipant(lane);
            if (!participant) return;

            const oldTop = this.preLaneBounds.top;
            const oldBottom = this.preLaneBounds.bottom;
            const newTop = lane.y;
            const newBottom = lane.y + lane.height;

            const topDelta = newTop - oldTop;
            const botDelta = newBottom - oldBottom;

            // decide affected region + delta
            let deltaY = 0;
            let inRegion: (y: number) => boolean;

            if (Math.abs(topDelta) > EPS) {
              // TOP edge moved -> everything strictly ABOVE oldTop shifts together
              deltaY = topDelta;
              inRegion = (y) => y < oldTop - EPS;
            } else if (Math.abs(botDelta) > EPS) {
              // BOTTOM edge moved -> everything AT/BELOW oldBottom shifts together
              deltaY = botDelta;
              inRegion = (y) => y >= oldBottom - EPS;
            } else {
              return;
            }

            // iterate all connections present before the resize
            Object.keys(this.preConnWps).forEach((cid) => {
              const conn = this.elementRegistry.get(cid);
              if (!conn) return;

              const preWps = this.preConnWps[cid];

              // if ALL pre-waypoints were in the affected region -> translate
              const allInRegion = preWps.every((wp) => inRegion(wp.y));

              if (allInRegion) {
                const moved = preWps.map((wp) => ({
                  x: wp.x,
                  y: wp.y + deltaY,
                }));
                this.modeling.updateWaypoints(conn, moved);
                if (conn.label)
                  this.modeling.moveShape(conn.label, { x: 0, y: deltaY });
              } else {
                // mixed or cross-lane -> let router recompute docking
                this.modeling.layoutConnection(conn, { resetWaypoints: true });
                if (conn.label)
                  this.modeling.moveShape(conn.label, { x: 0, y: 0 });
              }
            });

            // clear snapshot
            this.preLaneBounds = null;
            this.preConnWps = {};
          }
        );
      }
    },
  ],
};
