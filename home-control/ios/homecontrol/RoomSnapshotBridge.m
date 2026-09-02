#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (RoomSnapshotBridge, NSObject)

RCT_EXTERN_METHOD(recordAC:(nonnull NSNumber *)power
                  mode:(nonnull NSNumber *)mode
                  temp:(nonnull NSNumber *)temp
                  wind:(nonnull NSNumber *)wind)

RCT_EXTERN_METHOD(recordLights:(nonnull NSArray *)groups
                  isOn:(BOOL)isOn
                  brightness:(nullable NSNumber *)brightness
                  presetId:(nullable NSString *)presetId)

@end
