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

RCT_EXTERN_METHOD(logAction:(nonnull NSDictionary *)payload)
RCT_EXTERN_METHOD(readActionLog:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(clearActionLog)

@end
