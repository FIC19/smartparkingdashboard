import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('parking', '0002_parkinglot_lost_receipt_fee_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='Device',
            fields=[
                ('id',               models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('device_id',        models.CharField(max_length=64, unique=True, db_index=True)),
                ('name',             models.CharField(max_length=100)),
                ('device_type',      models.CharField(max_length=32, choices=[
                    ('entrance_unit', 'Entrance Unit'),
                    ('exit_unit',     'Exit Unit'),
                    ('slot_sensor',   'Slot Sensor Unit'),
                    ('smoke_sensor',  'Smoke / Fire Sensor'),
                ])),
                ('online_status',    models.BooleanField(default=False)),
                ('last_seen',        models.DateTimeField(null=True, blank=True)),
                ('ip_address',       models.GenericIPAddressField(null=True, blank=True)),
                ('firmware_version', models.CharField(max_length=32, blank=True, default='')),
                ('notes',            models.TextField(blank=True, default='')),
                ('created_at',       models.DateTimeField(auto_now_add=True)),
                ('updated_at',       models.DateTimeField(auto_now=True)),
                ('lot',              models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='devices',
                    to='parking.parkinglot',
                )),
            ],
            options={'ordering': ['device_type', 'name']},
        ),
        migrations.CreateModel(
            name='DeviceCommand',
            fields=[
                ('id',              models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('command_type',    models.CharField(max_length=32, choices=[
                    ('open_gate',  'Open Gate'),
                    ('close_gate', 'Close Gate'),
                    ('lcd_update', 'LCD Update'),
                    ('play_audio', 'Play Audio'),
                    ('reboot',     'Reboot Device'),
                    ('set_servo',  'Set Servo Angle'),
                ])),
                ('payload',         models.JSONField(default=dict)),
                ('executed',        models.BooleanField(default=False)),
                ('acknowledged_at', models.DateTimeField(null=True, blank=True)),
                ('created_at',      models.DateTimeField(auto_now_add=True)),
                ('device',          models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='commands',
                    to='device_control.device',
                )),
            ],
            options={'ordering': ['created_at']},
        ),
        migrations.CreateModel(
            name='SensorEvent',
            fields=[
                ('id',         models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(max_length=32, choices=[
                    ('heartbeat',         'Heartbeat'),
                    ('entrance_detected', 'Vehicle at Entrance'),
                    ('exit_detected',     'Vehicle at Exit'),
                    ('slot_occupied',     'Slot Occupied'),
                    ('slot_vacant',       'Slot Vacant'),
                    ('smoke_detected',    'Smoke / Fire Detected'),
                    ('plate_scanned',     'Plate Image Captured'),
                    ('gate_opened',       'Gate Opened'),
                    ('gate_closed',       'Gate Closed'),
                ])),
                ('payload',   models.JSONField(default=dict)),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('processed', models.BooleanField(default=False)),
                ('device',    models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='events',
                    to='device_control.device',
                )),
            ],
            options={'ordering': ['-timestamp']},
        ),
    ]
