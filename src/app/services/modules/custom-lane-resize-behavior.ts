import { is } from 'bpmn-js/lib/util/ModelUtil';

function isLane(shape: any) {
  return shape && is(shape.businessObject, 'bpmn:Lane');
}
function isParticipant(shape: any) {
  return shape && is(shape.businessObject, 'bpmn:Participant');
}
function findParticipant(shape: any) {
  let p = shape.parent;
  while (p && !isParticipant(p)) p = p.parent;
  return p;
}

class CustomLaneResizeBehavior {
  private eventBus: any;
  private modeling: any;

  static $inject = ['eventBus', 'modeling'];

  constructor(eventBus: any, modeling: any) {
    this.eventBus = eventBus;
    this.modeling = modeling;

    // run after default resize logic
    eventBus.on('commandStack.lane.resize.postExecute', 1500, (e: any) => {
      const { context } = e;
      const lane = context.lane || context.shape;
      const oldBounds = context.oldBounds;

      if (!isLane(lane) || !oldBounds) return;

      const deltaH = lane.height - oldBounds.height;
      if (!deltaH) return;

      const participant = findParticipant(lane);
      if (!participant) return;

      const lanes = (participant.children || []).filter((c: any) => isLane(c));
      const oldBottom = oldBounds.y + oldBounds.height;

      // all lanes whose top started below this divider
      const lanesBelow = lanes.filter(
        (ln: any) => ln.id !== lane.id && ln.y >= oldBottom - 0.5
      );

      // move each lane down/up without altering its height
      lanesBelow.forEach((ln: any) => {
        this.modeling.moveShape(ln, { x: 0, y: deltaH });
      });

      // move child elements of those lanes as well
      lanesBelow.forEach((ln: any) => {
        if (ln.children && ln.children.length) {
          this.modeling.moveElements(ln.children, { x: 0, y: deltaH }, ln);
        }
      });

      // resize participant (pool) height by delta
      this.modeling.resizeShape(participant, {
        x: participant.x,
        y: participant.y,
        width: participant.width,
        height: participant.height + deltaH,
      });
    });
  }
}

export default {
  __init__: ['customLaneResizeBehavior'],
  customLaneResizeBehavior: ['type', CustomLaneResizeBehavior],
};
