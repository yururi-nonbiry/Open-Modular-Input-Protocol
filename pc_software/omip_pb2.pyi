from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class WrapperMessage(_message.Message):
    __slots__ = ("input_digital", "input_analog", "input_encoder", "feedback_image", "feedback_led", "system_config", "capability_request", "capability_response")
    INPUT_DIGITAL_FIELD_NUMBER: _ClassVar[int]
    INPUT_ANALOG_FIELD_NUMBER: _ClassVar[int]
    INPUT_ENCODER_FIELD_NUMBER: _ClassVar[int]
    FEEDBACK_IMAGE_FIELD_NUMBER: _ClassVar[int]
    FEEDBACK_LED_FIELD_NUMBER: _ClassVar[int]
    SYSTEM_CONFIG_FIELD_NUMBER: _ClassVar[int]
    CAPABILITY_REQUEST_FIELD_NUMBER: _ClassVar[int]
    CAPABILITY_RESPONSE_FIELD_NUMBER: _ClassVar[int]
    input_digital: InputDigital
    input_analog: InputAnalog
    input_encoder: InputEncoder
    feedback_image: FeedbackImage
    feedback_led: FeedbackLed
    system_config: SystemConfig
    capability_request: DeviceCapabilityRequest
    capability_response: DeviceCapabilityResponse
    def __init__(self, input_digital: _Optional[_Union[InputDigital, _Mapping]] = ..., input_analog: _Optional[_Union[InputAnalog, _Mapping]] = ..., input_encoder: _Optional[_Union[InputEncoder, _Mapping]] = ..., feedback_image: _Optional[_Union[FeedbackImage, _Mapping]] = ..., feedback_led: _Optional[_Union[FeedbackLed, _Mapping]] = ..., system_config: _Optional[_Union[SystemConfig, _Mapping]] = ..., capability_request: _Optional[_Union[DeviceCapabilityRequest, _Mapping]] = ..., capability_response: _Optional[_Union[DeviceCapabilityResponse, _Mapping]] = ...) -> None: ...

class InputDigital(_message.Message):
    __slots__ = ("device_id", "port_id", "state")
    DEVICE_ID_FIELD_NUMBER: _ClassVar[int]
    PORT_ID_FIELD_NUMBER: _ClassVar[int]
    STATE_FIELD_NUMBER: _ClassVar[int]
    device_id: int
    port_id: int
    state: bool
    def __init__(self, device_id: _Optional[int] = ..., port_id: _Optional[int] = ..., state: bool = ...) -> None: ...

class InputAnalog(_message.Message):
    __slots__ = ("device_id", "port_id", "value")
    DEVICE_ID_FIELD_NUMBER: _ClassVar[int]
    PORT_ID_FIELD_NUMBER: _ClassVar[int]
    VALUE_FIELD_NUMBER: _ClassVar[int]
    device_id: int
    port_id: int
    value: float
    def __init__(self, device_id: _Optional[int] = ..., port_id: _Optional[int] = ..., value: _Optional[float] = ...) -> None: ...

class InputEncoder(_message.Message):
    __slots__ = ("device_id", "port_id", "steps")
    DEVICE_ID_FIELD_NUMBER: _ClassVar[int]
    PORT_ID_FIELD_NUMBER: _ClassVar[int]
    STEPS_FIELD_NUMBER: _ClassVar[int]
    device_id: int
    port_id: int
    steps: int
    def __init__(self, device_id: _Optional[int] = ..., port_id: _Optional[int] = ..., steps: _Optional[int] = ...) -> None: ...

class FeedbackImage(_message.Message):
    __slots__ = ("device_id", "screen_id", "format", "image_data")
    class ImageFormat(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
        __slots__ = ()
        RGB565_RLE: _ClassVar[FeedbackImage.ImageFormat]
        JPEG: _ClassVar[FeedbackImage.ImageFormat]
    RGB565_RLE: FeedbackImage.ImageFormat
    JPEG: FeedbackImage.ImageFormat
    DEVICE_ID_FIELD_NUMBER: _ClassVar[int]
    SCREEN_ID_FIELD_NUMBER: _ClassVar[int]
    FORMAT_FIELD_NUMBER: _ClassVar[int]
    IMAGE_DATA_FIELD_NUMBER: _ClassVar[int]
    device_id: int
    screen_id: int
    format: FeedbackImage.ImageFormat
    image_data: bytes
    def __init__(self, device_id: _Optional[int] = ..., screen_id: _Optional[int] = ..., format: _Optional[_Union[FeedbackImage.ImageFormat, str]] = ..., image_data: _Optional[bytes] = ...) -> None: ...

class FeedbackLed(_message.Message):
    __slots__ = ("device_id", "led_id", "color_rgb")
    DEVICE_ID_FIELD_NUMBER: _ClassVar[int]
    LED_ID_FIELD_NUMBER: _ClassVar[int]
    COLOR_RGB_FIELD_NUMBER: _ClassVar[int]
    device_id: int
    led_id: int
    color_rgb: int
    def __init__(self, device_id: _Optional[int] = ..., led_id: _Optional[int] = ..., color_rgb: _Optional[int] = ...) -> None: ...

class SystemConfig(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class DeviceCapabilityRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class DeviceCapabilityResponse(_message.Message):
    __slots__ = ("device_id", "ports")
    class PortDescription(_message.Message):
        __slots__ = ("type", "port_id")
        class PortType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
            __slots__ = ()
            DIGITAL_INPUT: _ClassVar[DeviceCapabilityResponse.PortDescription.PortType]
            ANALOG_INPUT: _ClassVar[DeviceCapabilityResponse.PortDescription.PortType]
            ENCODER_INPUT: _ClassVar[DeviceCapabilityResponse.PortDescription.PortType]
            IMAGE_OUTPUT: _ClassVar[DeviceCapabilityResponse.PortDescription.PortType]
            LED_OUTPUT: _ClassVar[DeviceCapabilityResponse.PortDescription.PortType]
        DIGITAL_INPUT: DeviceCapabilityResponse.PortDescription.PortType
        ANALOG_INPUT: DeviceCapabilityResponse.PortDescription.PortType
        ENCODER_INPUT: DeviceCapabilityResponse.PortDescription.PortType
        IMAGE_OUTPUT: DeviceCapabilityResponse.PortDescription.PortType
        LED_OUTPUT: DeviceCapabilityResponse.PortDescription.PortType
        TYPE_FIELD_NUMBER: _ClassVar[int]
        PORT_ID_FIELD_NUMBER: _ClassVar[int]
        type: DeviceCapabilityResponse.PortDescription.PortType
        port_id: int
        def __init__(self, type: _Optional[_Union[DeviceCapabilityResponse.PortDescription.PortType, str]] = ..., port_id: _Optional[int] = ...) -> None: ...
    DEVICE_ID_FIELD_NUMBER: _ClassVar[int]
    PORTS_FIELD_NUMBER: _ClassVar[int]
    device_id: int
    ports: _containers.RepeatedCompositeFieldContainer[DeviceCapabilityResponse.PortDescription]
    def __init__(self, device_id: _Optional[int] = ..., ports: _Optional[_Iterable[_Union[DeviceCapabilityResponse.PortDescription, _Mapping]]] = ...) -> None: ...
