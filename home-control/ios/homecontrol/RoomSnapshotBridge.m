#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE (RoomSnapshotBridge, RCTEventEmitter)

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

RCT_EXTERN_METHOD(readScheduleSettings:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(configureSchedules:(nonnull NSDictionary *)input resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(listSchedules:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(createSchedule:(nonnull NSDictionary *)input resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(cancelSchedule:(NSString *)identifier resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(requestScheduleNotifications:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(editSchedule:(nonnull NSDictionary *)input resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(consumeScheduleNotification:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(retrySchedule:(nonnull NSDictionary *)input resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
@end
