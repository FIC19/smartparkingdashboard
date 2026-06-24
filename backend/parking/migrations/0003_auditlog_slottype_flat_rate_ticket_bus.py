"""
Migration: Add AuditLog model, SlotType.flat_rate, Ticket bus vehicle type
"""
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('parking', '0002_parkinglot_lost_receipt_fee_and_more'),
    ]

    operations = [
        # Add flat_rate to SlotType
        migrations.AddField(
            model_name='slottype',
            name='flat_rate',
            field=models.DecimalField(
                decimal_places=0, default=0, max_digits=10,
                help_text='Optional flat rate (overrides hourly if > 0)'
            ),
        ),
        # Add 'bus' to Ticket.vehicle_type choices (data-only, Django doesn't enforce choices in DB)
        # AuditLog model
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('action', models.CharField(
                    choices=[
                        ('login', 'User Login'),
                        ('logout', 'User Logout'),
                        ('ticket_create', 'Ticket Created'),
                        ('ticket_checkout', 'Ticket Checkout'),
                        ('ticket_void', 'Ticket Voided'),
                        ('gate_open', 'Gate Opened'),
                        ('gate_override', 'Gate Override'),
                        ('slot_status', 'Slot Status Changed'),
                        ('user_create', 'User Created'),
                        ('user_update', 'User Updated'),
                        ('user_delete', 'User Deleted'),
                        ('pricing_change', 'Pricing Changed'),
                        ('audio_change', 'Audio Config Changed'),
                        ('free_pass', 'Free Pass Issued'),
                        ('alert_resolve', 'Alert Resolved'),
                    ],
                    db_index=True,
                    max_length=30,
                )),
                ('target_type', models.CharField(blank=True, max_length=50, help_text='Model name e.g. Ticket, User, ParkingSlot')),
                ('target_id', models.CharField(blank=True, max_length=100)),
                ('detail', models.TextField(blank=True, help_text='Human-readable summary of what changed')),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('timestamp', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('user', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='audit_logs',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'Audit Log',
                'ordering': ['-timestamp'],
            },
        ),
        # Add new audio trigger events (slot_assignment, payment_prompt, payment_confirmed, goodbye)
        migrations.AlterField(
            model_name='audioconfig',
            name='trigger_event',
            field=models.CharField(
                choices=[
                    ('system_start', 'System Start'),
                    ('vehicle_scan', 'Vehicle Scanning'),
                    ('access_granted', 'Access Granted'),
                    ('access_denied', 'Access Denied'),
                    ('vehicle_exit', 'Vehicle Exit'),
                    ('fire_alarm', 'Fire / Smoke Alarm'),
                    ('lot_full', 'Parking Lot Full'),
                    ('welcome', 'Welcome Message'),
                    ('slot_assignment', 'Slot Assignment'),
                    ('payment_prompt', 'Payment Prompt'),
                    ('payment_confirmed', 'Payment Confirmed'),
                    ('goodbye', 'Goodbye'),
                ],
                max_length=30,
            ),
        ),
    ]
