export type ActionType = 'PLACE_TOWER' | 'SELL_TOWER' | 'ACTIVATE_ABILITY';

export interface GameAction {
  timestamp: number; // Time relative to loop start (ms)
  type: ActionType;
  payload: any;
  loopId: number;
}

export class TimeManager {
  private startTime: number = 0;
  private recordedActions: GameAction[] = [];
  private currentLoopActions: GameAction[] = [];
  private isRecording: boolean = false;

  constructor() {}

  public startLoop(loopId: number) {
    this.startTime = Date.now();
    this.isRecording = true;
    this.currentLoopActions = [];
    console.log(`[TimeManager] Started Loop ${loopId}`);
  }

  public stopLoop() {
    this.isRecording = false;
    // Archive current loop actions
    this.recordedActions = [...this.recordedActions, ...this.currentLoopActions];
  }

  public recordAction(type: ActionType, payload: any, loopId: number) {
    if (!this.isRecording) return;

    const action: GameAction = {
      timestamp: Date.now() - this.startTime,
      type,
      payload,
      loopId
    };
    
    this.currentLoopActions.push(action);
    console.log('[TimeManager] Recorded:', action);
  }

  public getActionsForTimeWindow(start: number, end: number, currentLoopId: number): GameAction[] {
    return this.recordedActions.filter(action => {
      // Return actions from previous loops
      // That fall within the time window
      return action.loopId < currentLoopId && 
             action.timestamp >= start && 
             action.timestamp < end;
    });
  }

  public getAllRecordedActions(): GameAction[] {
    return this.recordedActions;
  }
  
  public clear() {
    this.recordedActions = [];
    this.currentLoopActions = [];
  }
  
  public getTimeElapsed(): number {
    if (!this.isRecording) return 0;
    return Date.now() - this.startTime;
  }
}
