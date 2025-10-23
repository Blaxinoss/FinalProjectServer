export enum EventType {
  OCCUPIED = 'occupied',
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  VIOLATION = 'violation',
  MAINTENANCE = 'maintenance'
}

export enum SlotStatus {
  AVAILABLE = 'available',
  OCCUPIED = 'occupied',
  RESERVED = 'reserved',
  MAINTENANCE = 'maintenance',
  DISABLED = 'disabled',
  CONFLICT = 'conflict',
  ASSIGNED = 'assigned'
}

export enum SlotType{
   REGULAR = 'regular',
  EMERGENCY= 'emergency',
}


export enum LightingCondition {
  BRIGHT = 'bright',
  NORMAL = 'normal',
  DIM = 'dim',
  DARK = 'dark'
}

export enum WeatherCondition {
  CLEAR = 'clear',
  RAINY = 'rainy',
  FOGGY = 'foggy',
  UNKNOWN = 'unknown'
}

export enum ViolationType {
  UNAUTHORIZED = 'unauthorized',
  OVERTIME = 'overtime',
  WRONG_SPOT = 'wrong_spot',
  BLOCKED_ENTRY = 'blocked_entry',
  OTHER = 'other'
}

export enum AlertType {
  VIOLATION = 'violation',
  OVERTIME = 'overtime',
  MAINTENANCE_NEEDED = 'maintenance_needed',
  CAMERA_OFFLINE = 'camera_offline',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SLOT_CONFLICT = 'slot_conflict',
  NO_SHOW = 'no_show'

}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum AlertStatus {
  PENDING = 'pending',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed'
}
