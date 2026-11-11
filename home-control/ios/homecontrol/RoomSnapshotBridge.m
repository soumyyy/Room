#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (RoomSnapshotBridge, NSObject)

RCT_EXTERN_METHOD(readScene:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(performScene:(NSString *)action
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(recordObservation:(nonnull NSDictionary *)payload)

RCT_EXTERN_METHOD(read:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(readAway:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(saveAway:(NSString *)json)

RCT_EXTERN_METHOD(recordNode:(nonnull NSNumber *)tube
                  fan:(nonnull NSNumber *)fan)

RCT_EXTERN_METHOD(recordAC:(nonnull NSNumber *)power
                  mode:(nonnull NSNumber *)mode
                  temp:(nonnull NSNumber *)temp
                  wind:(nonnull NSNumber *)wind)

RCT_EXTERN_METHOD(recordLights:(nonnull NSDictionary *)payload)

RCT_EXTERN_METHOD(logAction:(nonnull NSDictionary *)payload)
RCT_EXTERN_METHOD(readActionLog:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(clearActionLog)

@end
