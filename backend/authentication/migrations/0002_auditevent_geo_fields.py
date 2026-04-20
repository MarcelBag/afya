from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("authentication", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="auditevent",
            name="city",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="auditevent",
            name="country",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="auditevent",
            name="region",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="auditevent",
            name="isp",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="auditevent",
            name="location",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
