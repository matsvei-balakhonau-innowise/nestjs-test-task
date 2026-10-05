import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventsPublisherService } from './events-publisher.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsPublisher: EventsPublisherService) {}

  @Post('ping')
  @ApiOperation({
    summary: 'Publish a sample event (messaging + RedisTimeSeries smoke test)',
  })
  async ping() {
    const event = await this.eventsPublisher.publish(
      'health.check',
      'events.ping',
      { message: 'ping from service-a' },
    );
    return { ok: true, event };
  }
}
