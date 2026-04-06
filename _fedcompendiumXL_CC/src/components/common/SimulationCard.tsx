import React from 'react';
import {
  Box,
  Flex,
  Text,
  Icon,
  useColorModeValue,
  Spinner,
} from '@chakra-ui/react';
import { IconType } from 'react-icons';
import { motion } from 'framer-motion';

const MotionBox = motion(Box);

interface SimulationCardProps {
  title: string;
  description: string;
  icon: React.ElementType; // Changed from IconType to React.ElementType
  isActive?: boolean;
  isLoading?: boolean;
  onClick?: () => void;
}

export const SimulationCard: React.FC<SimulationCardProps> = ({
  title,
  description,
  icon,
  isActive = false,
  isLoading = false,
  onClick,
}) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const activeBgColor = useColorModeValue('blue.50', 'blue.900');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const activeBorderColor = useColorModeValue('blue.300', 'blue.600');
  const textColor = useColorModeValue('gray.800', 'white');
  const activeTextColor = useColorModeValue('blue.600', 'blue.200');
  const descriptionColor = useColorModeValue('gray.600', 'gray.400');
  const iconBgColor = useColorModeValue('blue.50', 'blue.900');
  const iconColor = useColorModeValue('blue.500', 'blue.300');

  return (
    <MotionBox
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <Box
        p={4}
        borderRadius="lg"
        bg={isActive ? activeBgColor : bgColor}
        border="1px"
        borderColor={isActive ? activeBorderColor : borderColor}
        boxShadow={isActive ? 'md' : 'sm'}
        cursor="pointer"
        position="relative"
        onClick={onClick}
        role="group"
        _hover={{
          boxShadow: 'md',
          borderColor: isActive ? activeBorderColor : 'blue.200',
        }}
      >
        <Flex alignItems="flex-start">
          <Box
            p={2}
            borderRadius="md"
            bg={iconBgColor}
            color={iconColor}
            mr={4}
          >
            <Icon as={icon} boxSize={5} />
          </Box>
          <Box flex="1">
            <Text
              fontWeight="bold"
              fontSize="md"
              mb={1}
              color={isActive ? activeTextColor : textColor}
            >
              {title}
            </Text>
            <Text fontSize="sm" color={descriptionColor}>
              {description}
            </Text>
          </Box>
          {isLoading && (
            <Spinner
              size="sm"
              color={activeTextColor}
              position="absolute"
              top="4"
              right="4"
            />
          )}
        </Flex>
      </Box>
    </MotionBox>
  );
};

export default SimulationCard;